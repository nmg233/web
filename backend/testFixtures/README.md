# 非业务测试夹具

- `schema-v16.sql`：从本仓库 `5777e98:backend/database/schema.sql` 提取的只读 SQL schema 快照。没有账号行、真实数据库或密钥，用于 017 在非空临时旧库中的保留与重复启动测试
- `teaching-replay.webm`：已有本机 FFmpeg 生成的纯测试图案，VP8、320×180、12 fps、1 秒、无音频。示例生成方式：`ffmpeg -f lavfi -i testsrc2=size=320x180:rate=12 -t 1 -c:v libvpx -an teaching-replay.webm`。用于真实专用视频上传、授权签名流和浏览器播放；不是课堂或学生上传文件，不代表所有浏览器编解码能力

测试数据只写 OS 临时数据库及上传目录，禁止将这些合成教学示例批量导入实际业务库
