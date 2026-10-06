/**
 * renderer_3.js — 滑翔机飞行回放 three.js 延迟渲染器
 *
 * 数据契约见 ../RENDER_API.md；管线与视觉对齐 ../gldeferred.py（Python 延迟渲染）：
 *   几何 pass(G-buffer MRT: 世界位置/世界法线/反照率)
 *     -> 光照 pass(全屏三角形，读 G-buffer；片段着色器变体可切换，见 LIGHT_MODES)
 *     -> overlay pass(拖尾丝带 + 起止标记，前向叠加)
 *
 * 坐标约定（与物理一致）：
 *   - 世界系 Y-up；机体系 x 前 / y 上 / z 右翼；
 *   - 姿态直接用逐帧四元数 xyzw，位置直接用世界坐标；
 *   - 模型轴转换在加载阶段烘焙到包裹节点，模型矩阵 = T(pos)·R(quat)·S(k)。
 *
 * 用法：
 *   import { GliderRenderer3D, parseFtrc } from './renderer_3.js';
 *   const buf = await (await fetch('../samples/flight_trace_sample.bin')).arrayBuffer();
 *   const r = new GliderRenderer3D('glider-canvas', buf, { autoplay: true });
 *   r.setLightMode('skyview');           // 运行时切换光照 pass 着色器变体（LIGHT_MODES）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// 常量（与 flight_trace.py / gldeferred.py 保持一致）
// ---------------------------------------------------------------------------
export const STATE_COLUMNS = ['t', 'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw', 'vx', 'vy', 'vz'];
const STATE_DIM = 11;
const FTRC_HEADER = 20;
const FTRC_VERSION = 1;
const SAMPLE_RATE = 120;          // Hz，均匀采样
const BODY_LENGTH = 7.2;          // 默认机型机长 (m)

// 光照 / 颜色（世界系，Y-up；取自 gldeferred.py）
const LIGHT_DIR = [0.30, 0.80, -0.52];
const LIGHT_COLOR = [0.95, 0.95, 0.92];
const AMBIENT_UP = [0.42, 0.45, 0.50];
const AMBIENT_DOWN = [0.30, 0.28, 0.26];
const SKY_TOP = [0.32, 0.52, 0.82];
const SKY_HORIZON = [0.80, 0.87, 0.95];
const FOG_COLOR = [0.78, 0.85, 0.93];
const GROUND_ALBEDO = [0.2, 0.2, 0.2];

// 全景机位（fixed）视距达 km 级：地面网格淡出距离在自适应基础上再放大一档，
// 让远处地面保留网格；其余机位保持原常数
const GRID_FADE_FIXED_MUL = 3;

// overlay（拖尾 / 标记）
const TRAIL_WARM = [0.95, 0.55, 0.20];
const TRAIL_GREEN = [0.30, 0.95, 0.25];
const TRAIL_BLUE = [0.18, 0.42, 0.86];
const MARK_START = [0.10, 0.62, 0.22];
const MARK_END = [0.86, 0.20, 0.20];
const MAX_TRAIL_POINTS = 5000;

const DEFAULT_OPTIONS = {
  modelUrl: '../assets/airplane.glb',
  assetBase: '',            // 光照贴图 URL 前缀（SPA 里用绝对路径 '/glider/'；'' = 原样，standalone 不受影响）
  modelFwd: '-x',
  modelUp: '+y',
  modelScale: 0,           // 0 = auto（最长包围盒边归一到机长）
  modelCenter: 'bbox',     // bbox | origin
  camera: 'fixed',         // fixed | chase | follow
  light: 'default',        // 光照 pass 着色器变体 id（见 LIGHT_MODES；'default' = 程序化天空）
  vExag: 'auto',           // 垂直夸张倍率（仅 fixed 机位渲染层生效；'auto' 按轨迹几何算）
  modelBoost: 'auto',       // 全景机位模型放大倍率（与 vExag 独立；'auto' 按视距占屏高 ~3%）
  followDist: 200,         // 跟随取景机位：相机与飞机的视距 (m)
  trailWidth: 4,           // 屏幕像素宽；0 = 关闭
  trailState: 'alt',       // alt | none
  grid: 25,                // 地面网格间距 (m)
  fogDensity: 3e-4,        // 指数雾密度 (1/m)
  speed: 1,
  autoplay: true,
  hud: true,
  pixelRatio: 0,           // 0 = min(devicePixelRatio, 2)
};

// ---------------------------------------------------------------------------
// ftrc 解析与轨迹归一化
// ---------------------------------------------------------------------------

/** 解析 ftrc 二进制（20B 头 + float32 小端行主序）为展平帧矩阵。 */
export function parseFtrc(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength < FTRC_HEADER) throw new Error('ftrc 数据过短');
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'FTRC') throw new Error(`不是 ftrc 数据（magic=${magic}）`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = dv.getUint32(4, true);
  const count = dv.getUint32(8, true);
  const dim = dv.getUint32(12, true);
  const extraDim = dv.getUint32(16, true);
  if (version !== FTRC_VERSION) throw new Error(`不支持的 ftrc 版本 ${version}`);
  if (dim !== STATE_DIM) throw new Error(`ftrc 维度不符合契约（dim=${dim}）`);
  const stride = dim + extraDim;
  const expected = FTRC_HEADER + count * stride * 4;
  if (bytes.byteLength < expected) throw new Error('ftrc 数据不完整');
  // 拷贝到 4 字节对齐的新缓冲（Float32Array 需要对齐；浏览器均为小端）
  const slice = bytes.buffer.slice(
    bytes.byteOffset + FTRC_HEADER,
    bytes.byteOffset + FTRC_HEADER + count * stride * 4,
  );
  return { count, dim, extraDim, stride, frames: new Float32Array(slice) };
}

/**
 * 把三种输入形态统一为 {count, dim, extraDim, stride, frames}：
 *   1. ArrayBuffer / Uint8Array —— 原始 ftrc 二进制；
 *   2. {count, dim, extra_dim, frames} —— RENDER_API.md 的 /trace JSON 响应；
 *   3. Float32Array —— 已展平帧矩阵（需 options.dim/extraDim）。
 */
function normalizeTrace(trace, options) {
  if (!trace) throw new Error('缺少轨迹数据');
  if (trace instanceof ArrayBuffer || trace instanceof Uint8Array) {
    return parseFtrc(trace);
  }
  if (trace instanceof Float32Array) {
    const dim = options.dim || STATE_DIM;
    const extraDim = options.extraDim || 0;
    const stride = dim + extraDim;
    if (trace.length % stride !== 0) throw new Error('Float32Array 长度与 dim/extraDim 不符');
    return { count: trace.length / stride, dim, extraDim, stride, frames: trace };
  }
  if (typeof trace === 'object' && Array.isArray(trace.frames)) {
    const count = trace.count ?? trace.frames.length;
    const dim = trace.dim ?? STATE_DIM;
    const extraDim = trace.extra_dim ?? Math.max(0, (trace.frames[0]?.length ?? dim) - dim);
    const stride = dim + extraDim;
    const frames = new Float32Array(count * stride);
    for (let i = 0; i < count; i++) {
      const row = trace.frames[i];
      for (let c = 0; c < stride; c++) frames[i * stride + c] = row[c];
    }
    return { count, dim, extraDim, stride, frames };
  }
  throw new Error('无法识别的轨迹数据格式（应为 ArrayBuffer / Float32Array / {frames}）');
}

// ---------------------------------------------------------------------------
// 着色器（GLSL ES 3.0；RawShaderMaterial 不自动注入，属性/内建 uniform 需显式声明）
// ---------------------------------------------------------------------------

const GBUFFER_VERT = /* glsl */`
precision highp float;
in vec3 position;
in vec3 normal;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 modelMatrix;
out vec3 vWorldPos;
out vec3 vWorldNormal;
void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GBUFFER_FRAG = /* glsl */`
precision highp float;
in vec3 vWorldPos;
in vec3 vWorldNormal;
uniform vec3 uColor;
layout(location = 0) out vec4 gPosition;
layout(location = 1) out vec4 gNormal;
layout(location = 2) out vec4 gAlbedo;
void main() {
    gPosition = vec4(vWorldPos, 1.0);       // w=1：几何存在标志（清屏为 0 -> 光照 pass 解析背景）
    gNormal = vec4(normalize(vWorldNormal), 0.0);
    gAlbedo = vec4(uColor, 1.0);
}`;

const LIGHT_VERT = /* glsl */`
precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const LIGHT_FRAG = /* glsl */`
precision highp float;
in vec2 vUv;

uniform sampler2D u_g_position;
uniform sampler2D u_g_normal;
uniform sampler2D u_g_albedo;
uniform mat4 u_inv_view_proj;
uniform vec3 u_cam_eye;
uniform vec3 u_light_dir;
uniform vec3 u_light_color;
uniform vec3 u_ambient_up;
uniform vec3 u_ambient_down;
uniform vec3 u_sky_top;
uniform vec3 u_sky_horizon;
uniform vec3 u_fog_color;
uniform vec3 u_ground_albedo;
uniform float u_fog_density;
uniform float u_grid_spacing;
uniform float u_grid_fade_dist;

out vec4 fragColor;

void main() {
    vec4 pos_f = texture(u_g_position, vUv);
    vec4 nrm_f = texture(u_g_normal, vUv);
    vec4 alb = texture(u_g_albedo, vUv);
    vec3 L = normalize(u_light_dir);

    if (pos_f.w < 0.5) {
        // ---- 背景：重构视线射线，解析渲染无限地面 / 渐变天空（无载体网格）----
        vec4 far = u_inv_view_proj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
        vec3 ray = normalize(far.xyz / far.w - u_cam_eye);

        vec3 sky = mix(u_sky_horizon, u_sky_top, smoothstep(-0.05, 0.45, ray.y));
        sky = mix(sky, u_fog_color, smoothstep(0.02, -0.08, -ray.y));

        if (ray.y < -1e-4) {
            float t = -u_cam_eye.y / ray.y;          // 射线与 y=0 平面求交
            vec3 wp = u_cam_eye + ray * t;
            float dist = t;
            float ndl = max(L.y, 0.0);               // 地面法线恒 +y
            vec3 lit = u_ground_albedo * (u_ambient_up + u_light_color * ndl);

            vec2 coord = wp.xz / u_grid_spacing;
            vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
            float line = 1.0 - min(min(grid.x, grid.y), 1.0);
            float fade = 1.0 - smoothstep(u_grid_fade_dist * 0.45, u_grid_fade_dist, dist);
            lit = mix(lit, lit * 1.6 + vec3(0.10), line * fade);

            float fog = 1.0 - exp(-u_fog_density * dist);
            lit = mix(lit, sky, fog);                 // 地平线以天空色融雾，无接缝
            fragColor = vec4(lit, 1.0);
        } else {
            fragColor = vec4(sky, 1.0);
        }
        return;
    }

    // ---- 几何（飞行器）光照：太阳方向光 + 半球环境光 + 弱 Blinn 高光 + 距离雾 ----
    float dist = length(u_cam_eye - pos_f.xyz);
    vec3 N = normalize(nrm_f.xyz);
    vec3 V = normalize(u_cam_eye - pos_f.xyz);
    float ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 40.0) * 0.25;
    vec3 ambient = mix(u_ambient_down, u_ambient_up, 0.5 * N.y + 0.5);
    vec3 lit = alb.rgb * (ambient + u_light_color * ndl) + u_light_color * spec;
    float fog = 1.0 - exp(-u_fog_density * dist);
    lit = mix(lit, u_fog_color, fog);
    fragColor = vec4(lit, 1.0);
}`;

const OVERLAY_VERT = /* glsl */`
precision highp float;
in vec3 position;
in vec3 color;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
out vec3 vColor;
out vec3 vWorldPos;
void main() {
    vColor = color;
    vWorldPos = position;                       // overlay 使用世界坐标（单位矩阵模型）
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const OVERLAY_FRAG = /* glsl */`
precision highp float;
in vec3 vColor;
in vec3 vWorldPos;
out vec4 fragColor;
void main() {
    if (vWorldPos.y < 0.0) discard;             // 丢弃地面以下片元，避免“穿”到地面下
    fragColor = vec4(vColor, 1.0);
}`;

// ---------------------------------------------------------------------------
// 光照 pass 着色器变体（LIGHT_MODES）
//
// lightPass 本身即"后处理"：变体是完整的光照 pass 片段着色器，几何光照
// 分支一致，仅背景绘制不同；setLightMode(id) 运行时热替换 fragmentShader
// （与 setCamera 同构）。新增变体：追加一个 LIGHT_MODES 条目即可。
// ---------------------------------------------------------------------------

// 变体二：环境贴图背景（整体移植 glshaders/lighting.frag 的环境贴图路径）
// —— 几何光照分支与 LIGHT_FRAG 完全一致，仅背景用等距柱状全景重绘
const LIGHT_FRAG_SKYVIEW = /* glsl */`
precision highp float;
in vec2 vUv;

uniform sampler2D u_g_position;
uniform sampler2D u_g_normal;
uniform sampler2D u_g_albedo;
uniform sampler2D u_skybox;
uniform mat4 u_inv_view_proj;
uniform vec3 u_cam_eye;
uniform vec3 u_light_dir;
uniform vec3 u_light_color;
uniform vec3 u_ambient_up;
uniform vec3 u_ambient_down;
uniform vec3 u_fog_color;
uniform vec3 u_ground_albedo;
uniform float u_fog_density;
uniform float u_grid_spacing;
uniform float u_grid_fade_dist;

out vec4 fragColor;

vec3 sky_color(vec3 dir_) {
    vec3 dir = normalize(dir_);
    float lon = atan(dir.z, dir.x);
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    vec2 uv = vec2(fract(lon / 6.2831853+0.75),  0.5-lat / 3.1415927);
    return texture(u_skybox, uv).rgb;
}

void main() {
    vec4 pos_f = texture(u_g_position, vUv);
    vec4 nrm_f = texture(u_g_normal, vUv);
    vec4 alb = texture(u_g_albedo, vUv);
    vec3 L = normalize(u_light_dir);

    if (pos_f.w < 0.5) {
        vec4 far = u_inv_view_proj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
        vec3 ray = normalize(far.xyz / far.w - u_cam_eye);

        if (ray.y < -1e-4) {
            float t = -u_cam_eye.y / ray.y;
            vec3 wp = u_cam_eye + ray * t;
            float dist = t;
            float ndl = max(L.y, 0.0);
            vec3 lit = u_ground_albedo * (u_ambient_up + u_light_color * ndl);

            vec2 coord = wp.xz / u_grid_spacing;
            vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
            float line = 1.0 - min(min(grid.x, grid.y), 1.0);
            float fade = 1.0 - smoothstep(u_grid_fade_dist * 0.45, u_grid_fade_dist, dist);
            lit = mix(lit, lit * 1.6 + vec3(0.10), line * fade);

            // float fog = 1.0 - exp(-u_fog_density * dist);
            // vec3 horizon = sky_color(vec3(ray.x, 0.0, ray.z));
            // lit = mix(lit, horizon, fog);

            vec3 sky = sky_color(ray * vec3(1.0, -1.0, 1.0));
            sky = mix(sky, u_fog_color, smoothstep(0.02, -0.08, -ray.y));
            float fade2 = 1.0 - smoothstep(0.0, u_grid_fade_dist * 7.0, dist);
            fragColor = vec4((lit + sky * (1.0 - fade2 * 0.2)) / 2.0, 1.0);
        } else {
            vec3 sky = sky_color(ray);
            sky = mix(sky, u_fog_color, smoothstep(0.02, -0.08, ray.y));
            fragColor = vec4(sky, 1.0);
        }
        return;
    }

    float dist = length(u_cam_eye - pos_f.xyz);
    vec3 N = normalize(nrm_f.xyz);
    vec3 V = normalize(u_cam_eye - pos_f.xyz);
    float ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 40.0) * 0.25;
    vec3 ambient = mix(u_ambient_down, u_ambient_up, 0.5 * N.y + 0.5);
    vec3 lit = alb.rgb * (ambient + u_light_color * ndl) + u_light_color * spec;
    float fog = 1.0 - exp(-u_fog_density * dist);
    lit = mix(lit, u_fog_color, fog);
    fragColor = vec4(lit, 1.0);
}`;

// 变体三：星空背景（用户新增，Star Nest 体积星空）
// 注意：不要写 #version —— 渲染器统一用 RawShaderMaterial + GLSL3，three 会自动在
// 最前面注入 "#version 300 es"；此处再写一条会造成 "must occur before anything else" 编译错误
const LIGHT_STELLARIS=`precision highp float;
in vec2 vUv;

uniform sampler2D u_g_position;
uniform sampler2D u_g_normal;
uniform sampler2D u_g_albedo;
uniform mat4 u_inv_view_proj;
uniform vec3 u_cam_eye;
uniform vec3 u_light_dir;
uniform vec3 u_light_color;
uniform vec3 u_ambient_up;
uniform vec3 u_ambient_down;
uniform vec3 u_fog_color;
uniform vec3 u_ground_albedo;
uniform float u_fog_density;
uniform float u_grid_spacing;
uniform float u_grid_fade_dist;

out vec4 fragColor;


// 回放时间 (s)：驱动 sky_color 中采样起点 from 的平移（暂停即静止）
uniform float u_time;

#define iterations 20
#define formuparam 0.7

#define volsteps 20
#define stepsize 0.1

#define zoom   0.800
#define tile   0.850
#define speed  0.010 

#define brightness 0.0015
#define darkmatter 0.300
#define distfading 0.730
#define saturation 0.850


vec3 sky_color(vec3 dir)
{
  float time=u_time*0.0005;
	vec3 from=vec3(1.,.5,0.5)+vec3(time*2.,time,-2.);
	
	//volumetric rendering
	float s=0.1,fade=1.;
	vec3 v=vec3(0.);
	for (int r=0; r<volsteps; r++) {
		vec3 p=from+s*dir*.5;
		p = abs(vec3(tile)-mod(p,vec3(tile*2.))); // tiling fold
		float pa,a=pa=0.;
		for (int i=0; i<iterations; i++) { 
			p=abs(p)/dot(p,p)-formuparam; // the magic formula
			a+=abs(length(p)-pa); // absolute sum of average change
			pa=length(p);
		}
		float dm=max(0.,darkmatter-a*a*.001); //dark matter
		a*=a*a; // add contrast
		if (r>6) fade*=1.-dm; // dark matter, don't render near
		//v+=vec3(dm,dm*.5,0.);
		v+=fade;
		v+=vec3(s,s*s,s*s*s*s)*a*brightness*fade; // coloring based on distance
		fade*=distfading; // distance fading
		s+=stepsize;
	}
	v=mix(vec3(length(v)),v,saturation); //color adjust
    v=tanh(v*.01);
	return v;
	
}

void main() {
    vec4 pos_f = texture(u_g_position, vUv);
    vec4 nrm_f = texture(u_g_normal, vUv);
    vec4 alb = texture(u_g_albedo, vUv);
    // vec3 L = normalize(u_light_dir);
    vec3 L = vec3(0.,1.,0.);

    if (pos_f.w < 0.5) {//背景部分
        vec4 far = u_inv_view_proj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
        vec3 ray = normalize(far.xyz / far.w - u_cam_eye);

        if (ray.y < -1e-4) {
            float t = -u_cam_eye.y / ray.y;
            vec3 wp = u_cam_eye + ray * t;
            float dist = t;
            float ndl = max(L.y, 0.0);
            // vec3 lit = u_ground_albedo * (u_ambient_up + u_light_color * ndl);
            vec3 lit=vec3(0.);

            vec2 coord = wp.xz / u_grid_spacing/2.;
            vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
            float line = 1.0 - min(min(grid.x, grid.y), 1.0);
            float fade = 1.0 - smoothstep(u_grid_fade_dist * 0.1, u_grid_fade_dist, dist);
            lit = mix(lit, lit * 1.6 + vec3(0.90,0.70,0.10), line * fade);

            vec3 sky = sky_color(ray * vec3(1.0, 1.0, 1.0));
            sky = mix(sky, u_fog_color, smoothstep(0.02, -0.08, -ray.y));
            float fade2 = 1.0 - smoothstep(0.0, u_grid_fade_dist * 7.0, dist);
            fragColor = vec4((lit + sky * (1.0 - fade2 * 0.2)) / 2.0, 1.0);
        } else {
            vec3 sky = sky_color(ray);
            sky = mix(sky, u_fog_color, smoothstep(0.02, -0.08, ray.y));
            fragColor = vec4(sky, 1.0);
        }
        return;
    }

    float dist = length(u_cam_eye - pos_f.xyz);
    vec3 N = normalize(nrm_f.xyz);
    vec3 V = normalize(u_cam_eye - pos_f.xyz);
    float ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 40.0) * 0.25;
    vec3 ambient = mix(u_ambient_down, u_ambient_up, 0.5 * N.y + 0.5);
    vec3 s_col=vec3(0.90,0.90,0.30);
    vec3 lit = alb.rgb * (ambient + s_col * ndl) + s_col * spec;
    float fog = 1.0 - exp(-u_fog_density * dist);
    lit = mix(lit, u_fog_color, fog);//模型部分
    fragColor = vec4(lit, 1.0);
}`

// 可选光照 pass 变体（运行时 setLightMode 切换；UI 下拉用 listLightModes()）
const LIGHT_MODES = [
  { id: 'default', label: '默认', frag: LIGHT_FRAG },
  { id: 'skyview', label: '天空', frag: LIGHT_FRAG_SKYVIEW, skybox: 'assets/skyview.jpg' },
  { id: 'stellaris', label: '星空', frag: LIGHT_STELLARIS },
];

// 环境贴图缓存：url -> { tex, ready }（跨实例共享；加载失败永远不 ready，
// skyview 变体保持未激活，光照 pass 维持当前变体）。
const SKYBOX_CACHE = new Map();

function skyboxTexture(url) {
  let entry = SKYBOX_CACHE.get(url);
  if (!entry) {
    entry = { tex: null, ready: false };
    SKYBOX_CACHE.set(url, entry);
    new THREE.TextureLoader().load(url, (tex) => {
      // 对齐 gldeferred._load_skybox：PIL 顶行上传（不翻转）、线性过滤、
      // 无 mipmap、边缘钳制（经度回绕由着色器 fract 完成）。
      tex.flipY = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      entry.tex = tex;
      entry.ready = true;
    }, undefined, (err) => {
      console.warn(`[glider3d] 环境贴图加载失败（skyview 变体不激活）：${url}`, err);
    });
  }
  return entry;
}

// ---------------------------------------------------------------------------
// 相机数学（移植 gldeferred.py 的取景 / 追逐机位）
// ---------------------------------------------------------------------------

function flightViewBounds(positions, padFrac = 0.18) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
  for (const p of positions) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[2] < z0) z0 = p[2];
    if (p[2] > z1) z1 = p[2];
    if (p[1] > y1) y1 = p[1];
  }
  let dx = Math.max(x1 - x0, 1e-6);
  let dz = Math.max(z1 - z0, 1e-6);
  if (dx < 60) { const c = (x0 + x1) / 2; x0 = c - 60; x1 = c + 60; dx = 120; }
  if (dz < 60) { const c = (z0 + z1) / 2; z0 = c - 60; z1 = c + 60; dz = 120; }
  x0 -= dx * padFrac; x1 += dx * padFrac;
  z0 -= dz * padFrac; z1 += dz * padFrac;
  const yTop = Math.max(y1 * 1.15 + 5, 45);
  return { x0, x1, y0: 0, y1: yTop, z0, z1 };
}

/** 固定机位：取景覆盖整条飞行走廊（与 gldeferred.fixed_camera 同算法）。 */
function fixedCamera(bounds, aspect, fovyDeg = 45, elevDeg = 8, azimDeg = -90) {
  const { x0, x1, y0, y1, z0, z1 } = bounds;
  const center = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const e = THREE.MathUtils.degToRad(elevDeg);
  const a = THREE.MathUtils.degToRad(azimDeg);
  const dir = new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), -Math.cos(e) * Math.sin(a));
  const f = dir.clone().multiplyScalar(-1);
  let s = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
  s = s.lengthSq() < 1e-18 ? new THREE.Vector3(1, 0, 0) : s.normalize();
  const u = new THREE.Vector3().crossVectors(s, f);

  const tanV = Math.max(Math.tan(THREE.MathUtils.degToRad(fovyDeg) / 2), 1e-6);
  const tanH = tanV * Math.max(aspect, 1e-6);
  let need = 0;
  for (const x of [x0, x1]) {
    for (const y of [y0, y1]) {
      for (const z of [z0, z1]) {
        const rel = new THREE.Vector3(x, y, z).sub(center);
        need = Math.max(need, Math.abs(rel.dot(s)) / tanH, Math.abs(rel.dot(u)) / tanV);
      }
    }
  }
  // 相机距离：把 8 个角点投影到相机系后，取“恰好装下走廊”的最大需求距离
  const dist = Math.max(need * 1.06, 1);
  const eye = center.clone().add(dir.multiplyScalar(dist));
  return { eye, target: center, dist };
}

/** 追逐机位：机体后上方 3/4 视角（与 gldeferred.chase_camera 同算法）。 */
function chaseCamera(pos, quat, dist = 55, height = 34, lateral = 26) {
  const xb = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);   // 机体前向
  const up = new THREE.Vector3(0, 1, 0);
  const xz = new THREE.Vector3(xb.x, 0, xb.z);
  if (xz.lengthSq() < 1e-12) xz.set(1, 0, 0); else xz.normalize();
  let side = new THREE.Vector3().crossVectors(up, xz);
  side = side.lengthSq() < 1e-12 ? new THREE.Vector3(0, 0, 1) : side.normalize().negate();
  const eye = pos.clone().sub(xz.clone().multiplyScalar(dist))
    .add(up.clone().multiplyScalar(height))
    .add(side.multiplyScalar(lateral));
  const target = pos.clone().add(xz.clone().multiplyScalar(8));
  return { eye, target };
}

// ---------------------------------------------------------------------------
// 主类
// ---------------------------------------------------------------------------

export class GliderRenderer3D {
  /**
   * @param {string|HTMLCanvasElement} canvasId canvas 元素 id（或元素本身）
   * @param {ArrayBuffer|Uint8Array|Float32Array|{count,dim,extra_dim,frames}} trace 逐帧轨迹数据
   * @param {object} options 见 DEFAULT_OPTIONS
   */
  constructor(canvasId, trace, options = {}) {
    this.opt = { ...DEFAULT_OPTIONS, ...options };
    this.trace = normalizeTrace(trace, this.opt);
    if (this.trace.extraDim > 2) this.trace.extraDim = 2;
    this._computeTraceMetrics();

    this.canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
    if (!this.canvas) throw new Error(`找不到 canvas：#${canvasId}`);

    this.playing = false;
    this.time = 0;
    this.speed = this.opt.speed;
    this.index = 0;
    this.cameraMode = this.opt.camera;
    this._disposed = false;
    this._frameCb = null;

    this._initRenderer();
    this._initGbuffer();
    this._initScene();
    this._initLighting();
    this._initOverlay();
    this._initHud();
    this._initLightMode();

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.canvas);
    }

    // 模型（异步；加载失败回退程序化盒体）
    this._loadModel();

    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
    if (this.opt.autoplay) this.play();
  }

  // ---- 初始化 ----

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    const pr = this.opt.pixelRatio > 0 ? this.opt.pixelRatio
      : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.autoClear = false;
    this.clock = new THREE.Clock();
  }

  _initGbuffer() {
    // 离屏 RT 尺寸乘 pixelRatio：画布按 dpr 渲染，G-buffer 若停留在 CSS 像素
    // 会让模型经 1x 采样放大后发糊（背景是逐像素解析渲染的，不受影响）
    const pr = this.renderer.getPixelRatio();
    const w = Math.max(1, Math.round((this.canvas.clientWidth || 800) * pr));
    const h = Math.max(1, Math.round((this.canvas.clientHeight || 600) * pr));
    this.gBuffer = new THREE.WebGLRenderTarget(w, h, {
      count: 3,
      // 世界位置（数百~数千米）与法线（-1..1）都超出 [0,1]：必须用浮点纹理，
      // 否则 8 位归一化纹理会把负法线截断为 0、把坐标压成常数，光照出现硬边界
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(w, h),
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this._gbufferMaterialCache = new Map();
  }

  _gbufferMaterial(color) {
    const key = color.map((c) => c.toFixed(3)).join(',');
    let mat = this._gbufferMaterialCache.get(key);
    if (!mat) {
      mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: GBUFFER_VERT,
        fragmentShader: GBUFFER_FRAG,
        uniforms: { uColor: { value: new THREE.Vector3(color[0], color[1], color[2]) } },
        side: THREE.DoubleSide,
      });
      this._gbufferMaterialCache.set(key, mat);
    }
    return mat;
  }

  _initScene() {
    this.gScene = new THREE.Scene();          // G-buffer 几何（飞行器）
    this.aircraftGroup = new THREE.Group();   // 逐帧 T(pos)·R(quat)
    this.modelHolder = new THREE.Group();     // 模型（GLB 归一化 / 程序化盒体）
    this.aircraftGroup.add(this.modelHolder);
    this.gScene.add(this.aircraftGroup);

    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 6000);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(0, 200, 600);

    const first = this._posAt(0);
    first.y *= this._renderYScale();
    this.aircraftGroup.position.copy(first);
    this.aircraftGroup.quaternion.set(...this._quatAt(0));
    this.modelHolder.scale.setScalar(this._modelBoost());   // 全景机位：模型倍率与轨迹 y 拉伸独立
  }

  _initLighting() {
    this.lightScene = new THREE.Scene();
    this.lightCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.lightUniforms = {
      u_g_position: { value: this.gBuffer.textures[0] },
      u_g_normal: { value: this.gBuffer.textures[1] },
      u_g_albedo: { value: this.gBuffer.textures[2] },
      u_inv_view_proj: { value: new THREE.Matrix4() },
      u_cam_eye: { value: new THREE.Vector3() },
      u_light_dir: { value: new THREE.Vector3(...LIGHT_DIR).normalize() },
      u_light_color: { value: new THREE.Vector3(...LIGHT_COLOR) },
      u_ambient_up: { value: new THREE.Vector3(...AMBIENT_UP) },
      u_ambient_down: { value: new THREE.Vector3(...AMBIENT_DOWN) },
      u_sky_top: { value: new THREE.Vector3(...SKY_TOP) },
      u_sky_horizon: { value: new THREE.Vector3(...SKY_HORIZON) },
      u_fog_color: { value: new THREE.Vector3(...FOG_COLOR) },
      u_ground_albedo: { value: new THREE.Vector3(...GROUND_ALBEDO) },
      u_fog_density: { value: this.opt.fogDensity },
      u_grid_spacing: { value: this.opt.grid },
      u_grid_fade_dist: { value: 1500 },
      u_time: { value: 0 },          // 回放时间(s)：星空等时间驱动变体使用，每帧写入
      u_skybox: { value: null },     // skyview 变体用（贴图就绪后填充）；其余变体的 shader 不引用
    };
    this.lightMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LIGHT_VERT,
      fragmentShader: LIGHT_FRAG,
      uniforms: this.lightUniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.lightScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lightMaterial));
    this._vp = new THREE.Matrix4();
  }

  _initOverlay() {
    this.overlayScene = new THREE.Scene();
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: OVERLAY_VERT,
      fragmentShader: OVERLAY_FRAG,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this._overlayMaterial = mat;

    // 拖尾丝带：预分配顶点/颜色缓冲 + 静态索引
    const max = MAX_TRAIL_POINTS;
    this._trailPositions = new Float32Array(max * 2 * 3);
    this._trailColors = new Float32Array(max * 2 * 3);
    this._trailIndex = new Uint32Array((max - 1) * 6);
    for (let k = 0; k < max - 1; k++) {
      const b = k * 6, v = k * 2;
      this._trailIndex[b] = v; this._trailIndex[b + 1] = v + 1; this._trailIndex[b + 2] = v + 3;
      this._trailIndex[b + 3] = v; this._trailIndex[b + 4] = v + 2; this._trailIndex[b + 5] = v + 3;
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this._trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(this._trailColors, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setIndex(new THREE.BufferAttribute(this._trailIndex, 1));
    trailGeo.setDrawRange(0, 0);
    this.trailMesh = new THREE.Mesh(trailGeo, mat);
    this.trailMesh.frustumCulled = false;
    this.overlayScene.add(this.trailMesh);

    // 起止标记（按当前机位的渲染层 y 倍率构建；机位切换时重建）
    this._rebuildMarkers();
  }

  _rebuildMarkers() {
    if (this.markerLines) {
      this.overlayScene.remove(this.markerLines);
      this.markerLines.geometry.dispose();
      this.markerLines = null;
    }
    const ys = this._renderYScale();
    const seg = [];
    const pushDiamond = (p, col, s = 6) => {
      const axes = [
        [[0, s, 0], [s, 0, 0], [0, -s, 0], [-s, 0, 0], [0, s, 0]],
        [[s, 0, 0], [0, 0, s], [-s, 0, 0], [0, 0, -s], [s, 0, 0]],
        [[0, s, 0], [0, 0, s], [0, -s, 0], [0, 0, -s], [0, s, 0]],
      ];
      for (const loop of axes) {
        for (let i = 0; i < loop.length - 1; i++) {
          seg.push(loop[i][0] + p[0], loop[i][1] + p[1], loop[i][2] + p[2], ...col);
          seg.push(loop[i + 1][0] + p[0], loop[i + 1][1] + p[1], loop[i + 1][2] + p[2], ...col);
        }
      }
    };
    const p0 = this._posAt(0);
    pushDiamond([p0.x, p0.y * ys, p0.z], MARK_START);
    const pn = this._posAt(this.trace.count - 1);
    pushDiamond([pn.x, pn.y * ys, pn.z], MARK_END);
    const markerGeo = new THREE.BufferGeometry();
    markerGeo.setAttribute('position', new THREE.Float32BufferAttribute(
      seg.filter((_, i) => i % 6 < 3), 3));
    markerGeo.setAttribute('color', new THREE.Float32BufferAttribute(
      seg.filter((_, i) => i % 6 >= 3), 3));
    this.markerLines = new THREE.LineSegments(markerGeo, this._overlayMaterial);
    this.markerLines.frustumCulled = false;
    this.overlayScene.add(this.markerLines);
  }

  _initHud() {
    if (!this.opt.hud) return;
    const div = document.createElement('div');
    div.className = 'glider-hud';
    div.style.cssText = [
      'position:absolute', 'left:12px', 'top:12px', 'padding:8px 12px',
      'background:rgba(255,255,255,0.82)', 'border:1px solid #bebebe',
      'border-radius:6px', 'font:13px/1.5 ui-monospace,Consolas,monospace',
      'color:#050510', 'white-space:pre', 'pointer-events:none', 'z-index:5',
    ].join(';');
    const parent = this.canvas.parentNode;
    if (parent) {
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      parent.appendChild(div);
    }
    this.hudEl = div;
  }

  _initLightMode() {
    // 光照 pass 着色器变体状态（lightPass 本身即"后处理"，无需额外 RT）
    this.lightMode = 'default';    // 当前已激活变体
    this._lightRequested = LIGHT_MODES.some((m) => m.id === this.opt.light)
      ? this.opt.light
      : 'default';
  }

  /** 每帧轮询：把请求的变体切换到激活态（skyview 贴图就绪后才真正切换）。 */
  _lightModePoll() {
    const id = this._lightRequested;
    if (this.lightMode === id) return;
    const def = LIGHT_MODES.find((m) => m.id === id);
    if (!def) { this._lightRequested = this.lightMode; return; }

    // 需要环境贴图的变体：贴图就绪后才切换；未就绪本帧维持现状
    if (def.skybox) {
      const base = this.opt.assetBase || '';
      const url = base ? `${base.replace(/\/+$/, '')}/${def.skybox.replace(/^\/+/, '')}` : def.skybox;
      const entry = skyboxTexture(url);
      if (!entry.ready) return;
      this.lightUniforms.u_skybox.value = entry.tex;
    } else {
      this.lightUniforms.u_skybox.value = null;
    }

    // 热替换光照 pass 片段着色器（uniforms 对象共享，未引用的 uniform 自动忽略）
    this.lightMaterial.fragmentShader = def.frag;
    this.lightMaterial.needsUpdate = true;
    this.lightMode = id;
  }

  // ---- 模型 ----

  _buildProcedural() {
    const L = BODY_LENGTH;
    const parts = [
      ['fuselage', [0, 0, 0], [L * 0.5 - 0.1, 0.18, 0.22], [0.95, 0.95, 0.95]],
      ['cockpit', [1.4, 0.18, 0], [0.9, 0.22, 0.32], [0.25, 0.55, 0.95]],
      ['wing', [0.1, 0, 0], [1.6, 0.035, 8.0], [0.85, 0.45, 0.12]],
      ['wingtip_l', [0.1, 0.28, 7.55], [0.7, 0.25, 0.06], [0.85, 0.45, 0.12]],
      ['wingtip_r', [0.1, 0.28, -7.55], [0.7, 0.25, 0.06], [0.85, 0.45, 0.12]],
      ['tailplane', [-4.8, 0.05, 0], [0.7, 0.03, 1.6], [0.90, 0.30, 0.30]],
      ['fin', [-4.7, 0.5, 0], [0.35, 0.85, 0.03], [0.90, 0.30, 0.30]],
    ];
    for (const [, center, half, color] of parts) {
      const geo = new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2);
      const mesh = new THREE.Mesh(geo, this._gbufferMaterial(color));
      mesh.position.set(center[0], center[1], center[2]);
      this.modelHolder.add(mesh);
    }
    console.info('[glider3d] 使用程序化盒体模型');
  }

  _loadModel() {
    const url = this.opt.modelUrl;
    if (!url) { this._buildProcedural(); return; }
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (this._disposed) return;
        try {
          const root = gltf.scene;
          // 1) 轴转换：把模型机头/上轴对齐到机体 x 前 / y 上（烘焙到包裹节点）
          root.quaternion.copy(this._axisConvQuat(this.opt.modelFwd, this.opt.modelUp));
          root.updateMatrixWorld(true);

          // 2) 联合归一化：包围盒居中 + 最长边缩放到机长
          const box = new THREE.Box3().setFromObject(root);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const k = this.opt.modelScale > 0 ? this.opt.modelScale : BODY_LENGTH / maxDim;
          if (this.opt.modelCenter !== 'origin') root.position.sub(center);

          const norm = new THREE.Group();
          norm.add(root);
          norm.scale.setScalar(k);

          // 3) 替换为 G-buffer 材质（反照率取原材质 base color，缺省白）
          this._applyGbufferMaterials(norm);
          this.modelHolder.add(norm);
          console.info(`[glider3d] 已加载模型 ${url}（scale=${k.toFixed(3)}）`);
        } catch (err) {
          console.warn('[glider3d] 模型归一化失败，回退程序化盒体：', err);
          this._buildProcedural();
        }
      },
      undefined,
      (err) => {
        console.warn('[glider3d] 模型加载失败，回退程序化盒体：', err);
        if (!this._disposed) this._buildProcedural();
      },
    );
  }

  _axisConvQuat(fwdTok, upTok) {
    const parse = (tok) => {
      const t = String(tok).trim().toLowerCase();
      const v = new THREE.Vector3();
      v.setComponent('xyz'.indexOf(t[1]), t[0] === '+' ? 1 : -1);
      return v;
    };
    const fModel = parse(fwdTok);
    const uModel = parse(upTok);
    // 目标：模型前 -> 机体 +x，模型上 -> 机体 +y，模型右 -> 机体 +z。
    // M = makeBasis(模型前/上/右) 把模型轴映射到世界；其逆 M^-1（正交基转置）把
    // 模型方向对齐到机体方向，作为包裹节点的旋转烘焙进模型。
    const rModel = new THREE.Vector3().crossVectors(fModel, uModel);
    const M = new THREE.Matrix4().makeBasis(fModel, uModel, rModel);
    const conv = M.clone().transpose();
    return new THREE.Quaternion().setFromRotationMatrix(conv);
  }

  _applyGbufferMaterials(obj) {
    obj.traverse((child) => {
      if (!child.isMesh) return;
      const src = Array.isArray(child.material) ? child.material[0] : child.material;
      let color = [0.8, 0.8, 0.8];
      if (src && src.color) color = [src.color.r, src.color.g, src.color.b];
      child.material = this._gbufferMaterial(color);
    });
  }

  // ---- 轨迹访问 ----

  _posAt(i) {
    const o = i * this.trace.stride;
    const f = this.trace.frames;
    return new THREE.Vector3(f[o + 1], f[o + 2], f[o + 3]);
  }

  _quatAt(i) {
    const o = i * this.trace.stride;
    const f = this.trace.frames;
    return [f[o + 4], f[o + 5], f[o + 6], f[o + 7]];
  }

  _extraAt(i) {
    const o = i * this.trace.stride;
    const f = this.trace.frames;
    const ex = this.trace.extraDim;
    return {
      cl: ex > 0 ? f[o + 11] : null,
      cd: ex > 1 ? f[o + 12] : null,
    };
  }

  /**
   * 一次遍历轨迹缓存几何度量（包围盒 / 高度范围）与垂直夸张倍率 _yScale。
   * 垂直夸张只作用于渲染层（fixed 机位），数据与 HUD 不变；倍率可经
   * options.vExag 指定数字，缺省按"垂直幅度 = 水平跨度 × 0.15"自动拟合，
   * 并钳制在 [1, 6]。
   */
  _computeTraceMetrics() {
    const f = this.trace.frames, stride = this.trace.stride;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    let altLo = Infinity, altHi = -Infinity;
    for (let i = 0; i < this.trace.count; i++) {
      const o = i * stride;
      const x = f[o + 1], y = f[o + 2], z = f[o + 3];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
      if (y < altLo) altLo = y; if (y > altHi) altHi = y;
    }
    this._metrics = { x0, x1, z0, z1, altLo, altHi };
    this._yScale = typeof this.opt.vExag === 'number'
      ? Math.max(1e-3, this.opt.vExag)
      : THREE.MathUtils.clamp(0.15 * Math.max(x1 - x0, z1 - z0) / Math.max(altHi, 1e-6), 1, 6);
  }

  /** 当前机位生效的渲染层 y 倍率（仅全景机位夸张，其余机位为 1）。 */
  _renderYScale() {
    return this.cameraMode === 'fixed' ? this._yScale : 1;
  }

  /**
   * 全景机位的模型放大倍率：与轨迹 y 拉伸（_renderYScale）独立，按取景视距
   * 自适应（目标约占屏高 3%，钳制 [1, 20]），路径夸张不变而模型单独放大至
   * 可辨；其余机位为 1。options.modelBoost 传数字则为恒定倍率。
   */
  _modelBoost() {
    if (this.cameraMode !== 'fixed') return 1;
    const b = this.opt.modelBoost;
    if (typeof b === 'number') return Math.max(1e-3, b);
    const d = this._fixedDist || 1000;
    return THREE.MathUtils.clamp(
      0.03 * 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * d / BODY_LENGTH,
      1, 20);
  }

  // ---- 尺寸 / 相机 ----

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || this.canvas.width || 800);
    const h = Math.max(1, this.canvas.clientHeight || this.canvas.height || 600);
    const pr = this.renderer.getPixelRatio();
    const rw = Math.max(1, Math.round(w * pr));    // 离屏 RT 用设备像素（同 _initGbuffer）
    const rh = Math.max(1, Math.round(h * pr));
    this.renderer.setSize(w, h, false);
    this.gBuffer.setSize(rw, rh);
    if (this.gBuffer.depthTexture) {
      this.gBuffer.depthTexture.image.width = rw;
      this.gBuffer.depthTexture.image.height = rh;
      this.gBuffer.depthTexture.dispose();
    }
    this.camera.aspect = w / h;
    this._recomputeFixedCamera();
    this.camera.updateProjectionMatrix();
    this._w = w; this._h = h;
  }

  _recomputeFixedCamera() {
    const ys = this._yScale;      // 全景机位取景永远按夸张后的世界拟合
    const positions = [];
    for (let i = 0; i < this.trace.count; i++) {
      const o = i * this.trace.stride;
      positions.push([this.trace.frames[o + 1], this.trace.frames[o + 2] * ys, this.trace.frames[o + 3]]);
    }
    const bounds = flightViewBounds(positions);
    const cam = fixedCamera(bounds, this.camera.aspect);
    this._fixedEye = cam.eye;
    this._fixedTarget = cam.target;
    this._fixedDist = cam.dist;
  }

  _updateCamera(dt = 0) {
    if (this.cameraMode === 'chase') {
      const pos = this.aircraftGroup.position;
      const quat = this.aircraftGroup.quaternion;
      const { eye, target } = chaseCamera(pos, quat);
      this.camera.position.copy(eye);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(target);
      this.camera.near = 1; this.camera.far = 5000;
    } else if (this.cameraMode === 'follow') {
      const d = this._updateFollowCamera(dt) || 500;
      this.camera.near = Math.max(1, d * 0.01);
      this.camera.far = Math.max(1000, d * 10);
    } else {
      this.camera.position.copy(this._fixedEye);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this._fixedTarget);
      const d = this._fixedDist || 1000;
      this.camera.near = Math.max(1, d * 0.01);
      this.camera.far = Math.max(1000, d * 10);
    }
    // 地面网格随取景视距等比缩放：远景（全景机位 km 级）下若维持 25m/1500m 常数，
    // 可见地面全部落在淡出区之外（网格消失）；间距与淡出距离同倍放大也避免子像素混叠。
    // 近景机位（chase ~70m / follow ~200m）倍率钳为 1，视觉与原常数完全一致。
    const viewDist = this.cameraMode === 'fixed' ? (this._fixedDist || 1000)
      : this.cameraMode === 'follow' ? Math.max(20, this.opt.followDist) : 0;
    const gs = Math.max(1, viewDist / 1500);
    this.lightUniforms.u_grid_spacing.value = this.opt.grid * gs;
    // 全景机位淡出距离再放长一档（间距不变），其余机位与原常数一致
    const fadeMul = this.cameraMode === 'fixed' ? GRID_FADE_FIXED_MUL : 1;
    this.lightUniforms.u_grid_fade_dist.value = 1500 * gs * fadeMul;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this._vp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.lightUniforms.u_inv_view_proj.value.copy(this._vp).invert();
    this.lightUniforms.u_cam_eye.value.copy(this.camera.position);
  }

  /**
   * 跟随取景机位：固定视角方向（同全景机位的仰角/方位），相机平滑跟随飞机，
   * 飞机始终居中；返回视距（供 near/far 推算）。
   */
  _updateFollowCamera(dt) {
    const p = this.aircraftGroup.position;          // 机体当前位置（_updateFrame 已更新）
    const e = THREE.MathUtils.degToRad(10), a = THREE.MathUtils.degToRad(-90);
    const dir = new THREE.Vector3(
      Math.cos(e) * Math.cos(a), Math.sin(e), -Math.cos(e) * Math.sin(a));
    const dist = Math.max(20, this.opt.followDist);
    const eye = p.clone().add(dir.multiplyScalar(dist));

    if (!this._followEye) {                         // 首帧 / 切机位后直接吸附
      this._followEye = eye.clone();
      this._followTarget = p.clone();
    } else {
      const k = 1 - Math.exp(-3 * dt);              // 指数阻尼平滑，不粘帧
      this._followEye.lerp(eye, k);
      this._followTarget.lerp(p, k);
    }
    this.camera.position.copy(this._followEye);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._followTarget);
    return dist;
  }

  // ---- 拖尾 ----

  _trailColor(alt, altLo, altHi, mode) {
    if (mode === 'none' || altHi - altLo < 1e-9) return TRAIL_BLUE;
    const t = THREE.MathUtils.clamp((alt - altLo) / (altHi - altLo), 0, 1);
    return [
      TRAIL_GREEN[0] * (1 - t) + TRAIL_WARM[0] * t,
      TRAIL_GREEN[1] * (1 - t) + TRAIL_WARM[1] * t,
      TRAIL_GREEN[2] * (1 - t) + TRAIL_WARM[2] * t,
    ];
  }

  _updateTrail(i) {
    const geo = this.trailMesh.geometry;
    const width = this.opt.trailWidth;
    if (!width || i < 1) { geo.setDrawRange(0, 0); return; }

    const ys = this._renderYScale();          // 渲染层 y 倍率（仅全景机位夸张）
    const altLo = this._metrics.altLo, altHi = this._metrics.altHi;   // 构造期缓存

    const f = this.trace.frames, stride = this.trace.stride;
    const start = Math.max(0, i - (MAX_TRAIL_POINTS - 1));
    const n = i - start + 1;
    const camEye = this.camera.position;
    const up = new THREE.Vector3(0, 1, 0);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const viewH = this._h || 600;
    const tmpP = new THREE.Vector3();
    const tmpRight = new THREE.Vector3();
    const tmpView = new THREE.Vector3();

    for (let k = 0; k < n; k++) {
      const idx = start + k;
      const o = idx * stride;
      tmpP.set(f[o + 1], f[o + 2] * ys, f[o + 3]);
      tmpView.copy(camEye).sub(tmpP);
      const dist = Math.max(tmpView.length(), 1e-3);
      tmpRight.crossVectors(up, tmpView);
      if (tmpRight.lengthSq() < 1e-12) tmpRight.set(1, 0, 0); else tmpRight.normalize();
      const halfW = Math.max(width * tanHalf * dist / viewH, 0.05);
      const col = this._trailColor(f[o + 2], altLo, altHi, this.opt.trailState);

      const a = (2 * k) * 3, b = (2 * k + 1) * 3;
      this._trailPositions[a] = tmpP.x + tmpRight.x * halfW;
      this._trailPositions[a + 1] = tmpP.y + tmpRight.y * halfW;
      this._trailPositions[a + 2] = tmpP.z + tmpRight.z * halfW;
      this._trailPositions[b] = tmpP.x - tmpRight.x * halfW;
      this._trailPositions[b + 1] = tmpP.y - tmpRight.y * halfW;
      this._trailPositions[b + 2] = tmpP.z - tmpRight.z * halfW;
      this._trailColors[a] = col[0]; this._trailColors[a + 1] = col[1]; this._trailColors[a + 2] = col[2];
      this._trailColors[b] = col[0]; this._trailColors[b + 1] = col[1]; this._trailColors[b + 2] = col[2];
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }

  // ---- 帧更新 / 渲染 ----

  _updateFrame(dt = 0) {
    const i = THREE.MathUtils.clamp(Math.round(this.time * SAMPLE_RATE), 0, this.trace.count - 1);
    this.index = i;
    const o = i * this.trace.stride;
    const f = this.trace.frames;
    const ys = this._renderYScale();                 // 渲染层 y 倍率（仅全景机位夸张）
    this.aircraftGroup.position.set(f[o + 1], f[o + 2] * ys, f[o + 3]);
    this.aircraftGroup.quaternion.set(f[o + 4], f[o + 5], f[o + 6], f[o + 7]);
    this.aircraftGroup.updateMatrixWorld(true);
    this.modelHolder.scale.setScalar(this._modelBoost());   // 模型按视距独立放大（与轨迹 y 拉伸无关）

    this._updateCamera(dt);
    this._updateTrail(i);
    this._updateHud(i);
  }

  _updateHud(i) {
    if (!this.hudEl) return;
    const o = i * this.trace.stride;
    const f = this.trace.frames;
    const t = f[o];
    const alt = f[o + 2];
    const v = Math.hypot(f[o + 8], f[o + 9], f[o + 10]);
    const sink = -f[o + 9];
    const { cl, cd } = this._extraAt(i);
    const ld = (cl != null && cd != null && Math.abs(cd) > 1e-6) ? (cl / cd) : null;
    this.hudEl.textContent =
      `t = ${t.toFixed(1)} s    h = ${alt.toFixed(0)} m    V = ${v.toFixed(1)} m/s\n` +
      `sink = ${sink.toFixed(2)} m/s   L/D = ${ld == null ? '—' : ld.toFixed(1)}`;
  }

  _render() {
    // 1) 几何 pass -> G-buffer（MRT）
    this.renderer.setRenderTarget(this.gBuffer);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.gScene, this.camera);

    // 2) 光照 pass -> 屏幕（可切换片段着色器变体，直渲屏幕）
    this._lightModePoll();
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.lightScene, this.lightCamera);

    // 3) overlay pass -> 屏幕（拖尾 / 标记，前景叠加）
    this.renderer.render(this.overlayScene, this.camera);
  }

  _loop() {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = this.clock.getDelta();
    if (this.playing) {
      this.time += dt * this.speed;
      if (this.time >= this.duration) { this.time = this.duration; this.playing = false; }
    }
    this._updateFrame(dt);
    this.lightUniforms.u_time.value = this.time;   // 时间驱动变体（星空）：随回放时间前进，暂停即静止
    this._render();
    if (this._frameCb) {
      this._frameCb({ t: this.time, index: this.index, duration: this.duration, playing: this.playing });
    }
  }

  // ---- 公开接口 ----

  get duration() { return (this.trace.count - 1) / SAMPLE_RATE; }
  getTime() { return this.time; }
  getDuration() { return this.duration; }
  isPlaying() { return this.playing; }

  play() { if (this.time >= this.duration) this.time = 0; this.playing = true; this.clock.getDelta(); return this; }
  pause() { this.playing = false; return this; }
  toggle() { return this.playing ? this.pause() : this.play(); }
  seek(t) { this.time = THREE.MathUtils.clamp(Number(t) || 0, 0, this.duration); return this; }
  setSpeed(x) { this.speed = Math.max(0.05, Number(x) || 1); return this; }
  setCamera(mode) {
    if (mode === 'fixed' || mode === 'chase' || mode === 'follow') {
      if (this.cameraMode !== mode) {
        this.cameraMode = mode;
        this._followEye = null;                 // 重置跟随机位平滑（首帧吸附）
        this._followTarget = null;
        this._rebuildMarkers();                 // y 倍率随模式变化，起止标记重建
      }
    }
    return this;
  }
  setHud(on) { if (this.hudEl) this.hudEl.style.display = on ? 'block' : 'none'; return this; }
  onFrame(cb) { this._frameCb = typeof cb === 'function' ? cb : null; return this; }

  /** 运行时切换光照 pass 着色器变体（贴图未就绪时下一帧轮询重试）；未知 id 警告并忽略。 */
  setLightMode(id) {
    if (LIGHT_MODES.some((m) => m.id === id)) {
      this._lightRequested = id;
    } else {
      console.warn(`[glider3d] 未知的光照变体：${id}（可用：${LIGHT_MODES.map((m) => m.id).join(', ')}）`);
    }
    return this;
  }
  getLightMode() { return this.lightMode; }
  /** 可选光照变体列表（UI 下拉用）：[{id, label}]。 */
  listLightModes() { return LIGHT_MODES.map(({ id, label }) => ({ id, label })); }

  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    if (this._ro) this._ro.disconnect();
    this.gScene.traverse((o) => { if (o.isMesh) o.geometry.dispose?.(); });
    this.overlayScene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
    for (const m of this._gbufferMaterialCache.values()) m.dispose();
    this._overlayMaterial?.dispose();
    this.lightMaterial?.dispose();
    this.gBuffer.dispose();
    if (this.hudEl) this.hudEl.remove();
    this.renderer.dispose();
  }
}

export default GliderRenderer3D;