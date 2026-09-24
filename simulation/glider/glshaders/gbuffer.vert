#version 330
// 几何 pass 顶点：机体系 -> 世界系 -> 裁剪空间，MRT 输出世界位置/法线/反照率。
// 模型矩阵 u_model = T(pos) · R(quat) · S(k)：纯物理姿态（轴转换 R_conv 已在
// gl_mesh.fit_parts 阶段烘焙进顶点，见 glb-deferred-renderer.md §3.2）。
// 均匀缩放 + 纯旋转下 mat3(u_model) 变换法线后归一化即得世界法线，无需独立 normal matrix。
in vec3 in_position;
in vec3 in_normal;
in vec3 in_color;
in vec2 in_uv;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;

out vec3 v_world_pos;
out vec3 v_world_normal;
out vec3 v_color;
out vec2 v_uv;

void main() {
    vec4 world = u_model * vec4(in_position, 1.0);
    v_world_pos = world.xyz;
    v_world_normal = normalize(mat3(u_model) * in_normal);
    v_color = in_color;
    v_uv = in_uv;
    gl_Position = u_proj * u_view * world;
}
