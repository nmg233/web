#version 330
// overlay pass 片段：直通逐顶点色（拖尾 alt 渐变 / 标记绿红均由顶点色携带）。
// 地面改为光照 pass 解析渲染后不再写深度，y<0 的 overlay 片元直接丢弃，
// 防止拖尾/标记在贴近地平线时"穿"到地面像素之下。
in vec4 v_color;
in vec3 v_world_pos;

out vec4 fragColor;

void main() {
    if (v_world_pos.y < 0.0) {
        discard;
    }
    fragColor = v_color;
}
