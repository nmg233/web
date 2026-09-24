#version 330
// blit pass 片段：lit FBO 纹理直通到屏幕（FBO 与屏幕同为 GL 左下原点，无需翻转）。
in vec2 v_uv;

uniform sampler2D u_tex;

out vec4 fragColor;

void main() {
    fragColor = texture(u_tex, v_uv);
}
