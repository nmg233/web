"""WSL 下修复 ImGui / PyOpenGL "no valid context" 问题。

在要运行的脚本最顶部加一行：

    import fix_wsl_gl  # noqa: F401

本模块会做两件事：
1. 让 PyOpenGL 的"当前上下文"查询改问 GLFW；
2. 在 ImGui 初始化前确保窗口上下文已设为当前。
"""

from __future__ import annotations


def _apply() -> None:
    import glfw

    try:
        from OpenGL import platform
    except Exception:
        return  # 没有 PyOpenGL 就不需要修

    # PyOpenGL 默认用 glXGetCurrentContext / eglGetCurrentContext 查询当前
    # 上下文；在 WSL 混合 GLFW + ModernGL 的环境下，它可能返回 0，导致
    # "Attempt to retrieve context when no valid context"。
    # 这里改成直接读 GLFW 的当前窗口，只要有窗口就认为存在上下文。
    def _current_context():
        ptr = glfw.get_current_context()
        if ptr:
            # ctypes 指针本身不可哈希，转成整型地址作为上下文键
            return getattr(ptr, "_as_parameter_", id(ptr))
        return None

    try:
        platform.GetCurrentContext = _current_context
    except Exception:
        pass

    # ImGui 的 GlfwRenderer 创建时会立刻创建并绑定 OpenGL 对象，
    # 必须确保此时窗口上下文已经设为当前。
    try:
        from imgui.integrations import glfw as _imgui_glfw

        _original_init = _imgui_glfw.GlfwRenderer.__init__

        def _patched_init(self, window, attach_callbacks: bool = True):
            try:
                glfw.make_context_current(window)
            except Exception:
                pass
            _original_init(self, window, attach_callbacks)

        _imgui_glfw.GlfwRenderer.__init__ = _patched_init
    except Exception:
        pass


_apply()
