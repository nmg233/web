# 数据课程包 v1 格式与恢复

这是数据格式，不是可执行插件。已验证版本组合：`format=pbl-course-data`、`formatVersion=1`、`themeVersion=1.0.0`、`appCompatibility=mentor-workspace-v1`。`packageVersion` 表示包发行，`contentVersion` 表示教材内容，均须三段数字；未知版本拒绝。主题版本独立于内容版本。ZIP格式或字段不支持时先转换，不承诺任意旧课程全兼容。

## 本机工具与真实样包

以项目根目录为工作目录，使用已安装依赖和Node：

```powershell
node scripts/validate-course-package.cjs frontend/public/course-packages/sample-course-v1.zip
node scripts/preview-course-package.cjs frontend/public/course-packages/sample-course-v1.zip .local/my-new-readonly-preview
# 仅生成明确的测试样包；不要将测试教材当成正式内容
node scripts/build-course-package-sample.cjs .local/my-test-course.zip
```

校验工具不连接API/数据库；校验格式、字节、哈希和引用，服务器还会按原学习服务复核卡片/答案语义、角色/目标权限。预览输出必须是项目内尚不存在的新目录，不覆盖文件，打开其中index.html；只读、不读取学生信息、不执行包代码。不要在服务器上传/运行这些脚本。

网页 `/course-packages/sample-course-v1.zip` 是实际可导入的四模板测试包；`/course-packages/sample-preview/index.html` 为其实际离线预览。解压样包查看完整manifest，不能只压缩外层目录：根目录必须直接出现manifest.json。

## 容器与安全限制

ZIP≤20MiB；解压合计≤50MiB；单文件≤10MiB；最多200文件、目录最多另20条、路径≤4层；单条压缩比≤250；manifest≤2MiB、JSON≤32层；课时1–100。单图≤5MiB、≤1600万像素；文本资料≤1MiB。素材重复引用可能产生多份课时文件，导入物化总量≤100MiB，超限回滚。

仅STORE/DEFLATE、UTF-8且ASCII安全文件路径，如 `assets/observation.webp`。拒绝加密/分卷/ZIP64、穿越/绝对路径/反斜杠、链接/设备、大小写重复、条目重叠、伪造类型、CRC/大小不一致和未声明/未引用文件。不按包内路径直接解压；服务端生成自己的隔离目录和文件名。

图片PNG/JPG/WebP，扩展名、MIME、真实签名及结构须一致。普通文档仅PDF、UTF-8 TXT/MD/CSV；PDF拒绝已知脚本/启动/嵌入/加密动作，不声称提供完整恶意软件扫描。Office/宏、嵌套ZIP、SVG、HTML/JS、SQL、模块/安装钩子、字体/任意CSS都拒绝。文章文本按已有安全渲染；不能嵌脚本、事件或HTML媒体。合法HTTPS无凭据教学链接仅保存，不由导入器远端抓取。

账号、学校、授权、生产数据库ID、学生答案/成绩、钱包、奖励、密钥、本机路径均不是允许字段，出现会拒绝。

## 白名单字段

未知字段逐层报错。选填字段省略，不能用null代替必填。所有对象局部ID是字母开头的1–64位字母/数字/下划线/横线，整个包唯一；文章块ID在同文章唯一。不是数据库ID，真实ID由服务器产生并在结果mapping查询。

|对象|允许字段/约束|
|---|---|
|manifest|format、formatVersion、packageId、packageVersion、contentVersion、themeVersion、appCompatibility、course、chapters数组、lessons数组、assets数组|
|course|id、title(必填≤120)、grade_level(primary/junior/senior)、difficulty(basic/advanced/challenge)、public_theme(campus/sky/forest/beach)；选填description、driving_question、learning_objectives、story_line、materials_needed、theme(普通教学主题文字)、themeAssets|
|themeAssets|cover/desktop/mobile/mark，各值为已声明image素材ID。仅新建时绑定，追加不覆盖目标主题|
|chapter|id、title；课时chapterRef指它，未指定仍可见，不编造正式章节|
|lesson|id、title、presentation_type(learning/visit/theory/experiment)；选填description、teaching_tip、duration(正整数分钟)、chapterRef、review_content、report_guidance、experiment_guidance、moments_note、article_title、article_url、article_blocks、map、cards、tasks、resources、experiments|
|map|assetRef图片ID或defaultNode(所选主题的node1/2/3受控ID)；landing=[x,y]各0.1–0.9；自图优先。没有字段时保留rock降级，不按名称猜题材|
|asset|id、path(assets/下安全路径)、sha256(真实小写SHA256)、kind(image/document)、mime|
|resource|id、title；选填description、resource_type(lesson_plan/guide_card/template/courseware/other)、assetRef；待补视频改用resource_type=video、pendingVideo=true、note必填，无assetRef|
|article block|paragraph：id/type/text；image/file：id/type/resourceRef及选填title/caption。仅能引用本课时真实resource，image需图片，file需普通文档；待补视频不能当已上传文章块|
|card|id、title、content；选填summary、key_points、common_mistakes、example_content、is_required布尔、estimated_minutes、exercises数组。全部导入草稿|
|exercise|id、question_type、prompt、answer、explanation必填；选填options、rubric、points(1–100)、is_required。沿现有练习校验，不把题分当金币|
|task|id、title、task_type(inquiry/experiment/creation/reflection/presentation)；选填description、require_upload布尔、deadline合法时间字符串|
|experiment|id、experiment=glider、label；选填stage(0–3)、cardRef(本课时卡片且stage=1)。只建立关联，不导入或运行物理程序|

答案示例：单选`"a"`并有`[{"value":"a","label":"A"}]`；多选`["A","B"]`对应字符串选项；判断`true`；填空`{"blanks":[["测试"]]}`；简答为参考答案字符串，可附rubric。其他语义限制沿原服务，错误在写库前返回。

文章最多200块、合计250000字符；段落/常规正文默认≤10000，卡片正文≤20000，题干/解析≤5000，摘要≤1000。完整边界见实际校验工具及 `backend/services/coursePackageFormat.js`，不要自行增加未支持字段。

## 追加、重试和版本

新建课程为draft，课时preparing，卡片draft；无课程学校、报名、奖励。追加只插入新章节/课时/资源/卡片/任务/关联，不覆盖旧记录。包内课程标题/介绍/主题等在清单列出为本次不覆盖项；默认节点必须匹配目标主题，否则导入前转换或换自有图，不能悄悄换目标主题。视频待补记录不是已上传文件，成功后按具体课时补传并核对。

清单签名包含当前目标修订及导师学校范围，提交事务内重新核验；并发维护会409，保留选择后重新生成清单。新资源先写独立分配目录，事务失败补偿只删除这次新目录，不动历史。SQLite立即事务序列化写入；包身份/版本/目标约束及请求键防重复。相同内容仅重新压缩，内容摘要相同，仍复用原结果；同身份版本内容不同拒绝，需要升版本。不同版本追加仍是新增，不是更新旧教材。

确认超时先查询服务器结果，不用新请求键盲目导入。请求键按账号保存当前标签页会话，服务器成功历史可跨设备查看；当前权限失效则不能再查看对应课程结果。暂存最多3包/账号，24小时后不可使用；下一次上传时清理到期暂存，或主动取消。成功导入不依赖继续保留暂存；取消不能撤销课程，撤回错误课程需按原管理流程人工处理，不删除学习历史。
