#version 330
// overlay pass 顶点（前向非光照，画入 lit FBO）：
// 拖尾 billboard 丝带（TRIANGLE_STRIP，宽度已按相机距离在 CPU 侧缩放）
// 与起/终点三向菱形标记（TRIANGLES）共用此程序，逐顶点色。
// 顶点即世界坐标，透传给片段做 y<0 discard（地面无深度后防止 overlay 穿地）。
in vec3 in_position;
in vec4 in_color;

uniform mat4 u_mvp;   // proj @ view（顶点直接给世界系坐标）

out vec4 v_color;
out vec3 v_world_pos;

void main() {
    v_color = in_color;
    v_world_pos = in_position;
    gl_Position = u_mvp * vec4(in_position, 1.0);
}
