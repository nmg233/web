#version 330
// 光照 pass 顶点：全屏大三角形（3 顶点覆盖 NDC [-1,3]×[-1,3]），
// 与 blit.vert 同格式，可共用 VBO。
in vec2 in_position;
in vec2 in_uv;

out vec2 v_uv;

void main() {
    v_uv = in_uv;
    gl_Position = vec4(in_position, 0.0, 1.0);
}
