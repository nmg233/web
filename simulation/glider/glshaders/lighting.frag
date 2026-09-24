#version 330
// 光照 pass 片段：读 3 张 G-buffer，合成最终画面。
//   几何像素（pos.w>=0.5，飞行器）：
//     太阳方向光（Lambert + 弱 Blinn 高光）+ 半球环境光 + 距离雾
//   背景像素（pos.w<0.5，清屏）：由视线射线解析渲染，无任何载体网格——
//     向下射线：与无限地面平面 y=0 求交，程序化地面（基色 + fwidth 抗锯齿
//               网格 + 距离淡出 + 雾），不存在远处四边形裁剪边
//     向上射线：天空渐变（按仰角插值，地平线以下融为雾色）
//   地平线衔接：ray.y -> 0 时 t -> 无穷，雾 -> 1，地面色收敛于雾色，
//   与天空分支的地平线融雾一致，无接缝。
// 不做阴影 / SSAO / 后处理（保持成比例，见计划 §3.3）。
in vec2 v_uv;

uniform sampler2D u_g_position;
uniform sampler2D u_g_normal;
uniform sampler2D u_g_albedo;

uniform mat4 u_inv_view_proj;
uniform vec3 u_cam_eye;
uniform vec3 u_light_dir;        // 世界系，指向光源
uniform vec3 u_light_color;
uniform vec3 u_ambient_up;
uniform vec3 u_ambient_down;
uniform vec3 u_sky_top;
uniform vec3 u_sky_horizon;
uniform vec3 u_fog_color;
uniform vec3 u_ground_albedo;    // 无限地面基色（与 mpl 路径地面色一致）
uniform float u_fog_density;     // 1/m，exp 雾
uniform float u_grid_spacing;    // 地面网格间距（m）
uniform float u_grid_fade_dist;  // 网格淡出距离（m）

// 等距柱状天空贴图：assets/skyview.jpg（2:1，行=方位角、列=仰角），
// u_use_skybox==0 时退回渐变天空。
uniform sampler2D u_skybox;
uniform float u_use_skybox;

out vec4 fragColor;


vec3 sky_color(vec3 dir_) {
    vec3 dir = normalize(dir_);
    float lon = atan(dir.z, dir.x);
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    vec2 uv = vec2(fract(lon / 6.2831853 + 0.5), 0.5 - lat / 3.1415927);
    vec3 col = texture(u_skybox, uv).rgb;
    return col;
}

void main() {
    vec4 pos_f = texture(u_g_position, v_uv);
    vec4 nrm_f = texture(u_g_normal, v_uv);
    vec4 alb = texture(u_g_albedo, v_uv);

    if (pos_f.w < 0.5) {
        // 背景：重构视线方向（NDC 远点 -> 世界射线）
        vec4 far = u_inv_view_proj * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
        vec3 ray = normalize(far.xyz / far.w - u_cam_eye);
        if (ray.y < -1e-4) {
            // ---- 无限地面平面（y=0）解析渲染 ----
            float t = -u_cam_eye.y / ray.y;
            vec3 wp = u_cam_eye + ray * t;          // 地面交点，wp.y == 0
            float dist = t;                          // 沿视线的地面距离
            vec3 L = normalize(u_light_dir);
            float ndl = max(L.y, 0.0);               // 地面法线恒 +y
            vec3 lit = u_ground_albedo * (u_ambient_up + u_light_color * ndl);

            vec2 coord = wp.xz / u_grid_spacing;
            vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
            float line = 1.0 - min(min(grid.x, grid.y), 1.0);
            float fade = 1.0 - smoothstep(u_grid_fade_dist * 0.45, u_grid_fade_dist, dist);
            lit = mix(lit, lit * 1.6 + vec3(0.10), line * fade);

            float fog = 1.0 - exp(-u_fog_density * dist);
            vec3 horizon =
                mix(sky_color(vec3(ray.x, 0.0, ray.z)), u_fog_color,
                    1.0 - u_use_skybox);            // 贴图可用则地平线取天空色，无法接缝
            lit = mix(lit, horizon, fog);
            
            vec3 sky = u_use_skybox > 0.5
                       ? sky_color(ray*vec3(1.,-1.,1.))
                       : mix(u_sky_horizon, u_sky_top,
                             smoothstep(-0.05, 0.45, ray.y));
            sky = mix(sky, u_fog_color, smoothstep(0.02, -0.08, -ray.y));

            float fade2=1.0-smoothstep(0,u_grid_fade_dist*7. ,dist);
            fragColor = vec4((lit+sky*(1-fade2*.6))/2, 1.0);
        } else {
            // ---- 天空：优先等距柱状贴图，无图则渐变 ----
            vec3 sky = u_use_skybox > 0.5
                       ? sky_color(ray)
                       : mix(u_sky_horizon, u_sky_top,
                             smoothstep(-0.05, 0.45, ray.y));
            sky = mix(sky, u_fog_color, smoothstep(0.02, -0.08, ray.y));
            fragColor = vec4(sky, 1.0);
        }
        return;
    }

    // ---- 几何（飞行器）光照 ----
    float dist = length(u_cam_eye - pos_f.xyz);
    vec3 N = normalize(nrm_f.xyz);
    vec3 V = normalize(u_cam_eye - pos_f.xyz);
    vec3 L = normalize(u_light_dir);
    float ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 40.0) * 0.25;
    vec3 ambient = mix(u_ambient_down, u_ambient_up, 0.5 * N.y + 0.5);
    vec3 lit = alb.rgb * (ambient + u_light_color * ndl) + u_light_color * spec;

    // 距离雾
    float fog = 1.0 - exp(-u_fog_density * dist);
    lit = mix(lit, u_fog_color, fog);

    fragColor = vec4(lit, 1.0);
}
