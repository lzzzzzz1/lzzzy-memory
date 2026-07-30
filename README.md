# 我们的地图 · 阶段 0 原型

这是只用于验证技术路线的情侣私密旅行记忆原型。它使用演示数据启动；只有完成 Supabase 配置和 SQL 迁移后才会连接真实的测试账号与私有媒体。

## 本地启动

1. 安装 Node.js 24+，在项目目录运行 `npm.cmd install`。
2. 复制 `.env.example` 为 `.env.local`，填写 Supabase URL、匿名密钥和 Cesium Ion Token。
3. 在 Supabase SQL Editor 按文件名顺序运行 `supabase/migrations` 中的四个迁移：
   `202607270001_stage_zero.sql`、`202607290002_visits_multimedia.sql`、
   `202607290003_fix_rpc_place_id.sql`、`202607300004_towhere_fusion.sql`。
4. 在 Supabase Auth 后台关闭公开注册，并手动创建两个测试邮箱密码用户。
5. 按 `docs/supabase-setup.md` 创建一个 `couples` 记录，并将这两个用户的 UUID 加入 `couple_members`。不要把 service role key 写入浏览器或 Git。
6. 运行 `npm.cmd run dev`，浏览器打开 `http://localhost:3000`。

## 验证顺序

- 未配置 `.env.local`：确认地球、地点点击、旅行卡片、时间轴和本地测试照片预览可用。
- 配置后：用两个测试账号分别登录，创建测试旅行、地点、文字回忆和一张私有照片；再使用第三个账号确认无法读取记录或私有桶对象。
- 在 Windows 和两部手机上记录地球加载时长、旋转帧率与地点点击表现。测试期间只上传可丢弃照片。

## 安全边界

- `travel-media` 桶保持私有；数据库只保存对象键，不保存长期 URL。
- 所有业务表启用 RLS；更新通过 `version` 字段检测旧版本写入。
- 已支持同城多次到访、单段回忆 20 张照片与 2 个视频、完整城市档案，以及带 SHA-256 校验的数据与私有媒体备份恢复。
- 已安全融合回忆宇宙、我们的第一次、私密信件、双人能量记录和仅本机播放的回忆音乐；新增云端记录继续按 `couple_id` 进行 RLS 隔离，并包含在完整备份中。
- 尚未加入正式部署、语音、EXIF 导入、图片缩略图生成与后台断点续传。

## 后续架构

参考项目的功能拆解、当前风险、目标数据模型与分阶段升级顺序见
[`docs/architecture-roadmap.md`](docs/architecture-roadmap.md)。
