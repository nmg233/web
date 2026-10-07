-- 016：课程结束后可独立补录回放内容摘要，保留已有视频与简介。
ALTER TABLE course_replays ADD COLUMN summary TEXT;
