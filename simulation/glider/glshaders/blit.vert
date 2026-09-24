#version 330
// blit pass 顶点（WindowSink 专用）：全屏大三角形，拷贝 lit FBO 到默认帧缓冲。
// 与 lighting.vert 同格式，共用 VBO。
in vec2 in_position;
in vec2 in_uv;

out vec2 v_uv;

void main() {
    v_uv = in_uv;
    gl_Position = vec4(in_position, 0.0, 1.0);
}
