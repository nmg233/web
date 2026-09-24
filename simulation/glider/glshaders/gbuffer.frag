#version 330
// 几何 pass 片段：MRT 写出 G-buffer 三附件。
//   g_position: RGBA16F  xyz=世界坐标, w=1（几何存在标志，清屏为 0 -> 光照 pass 解析背景）
//   g_normal:   RGBA16F  xyz=世界法线, w=未用（地面已改为光照 pass 解析渲染，不再入 G-buffer）
//   g_albedo:   RGBA8    rgb=反照率（顶点色 × 材质色，含贴图采样）, a=未用
// 贴图经 u_use_tex 开关：无贴图部件绑 1x1 白纹理，乘法恒等。
in vec3 v_world_pos;
in vec3 v_world_normal;
in vec3 v_color;
in vec2 v_uv;

uniform sampler2D u_tex;
uniform float u_use_tex;

layout(location = 0) out vec4 g_position;
layout(location = 1) out vec4 g_normal;
layout(location = 2) out vec4 g_albedo;

void main() {
    vec3 albedo = v_color;
    if (u_use_tex > 0.5) {
        albedo *= texture(u_tex, v_uv).rgb;
    }
    g_position = vec4(v_world_pos, 1.0);
    g_normal = vec4(normalize(v_world_normal), 0.0);
    g_albedo = vec4(albedo, 1.0);
}
