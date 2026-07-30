# Supabase 测试环境接入

1. 创建 Supabase 项目，在 Auth 设置中关闭公开注册，并创建两个测试邮箱密码账户。
2. 在 SQL Editor 按顺序运行：
   - `supabase/migrations/202607270001_stage_zero.sql`
   - `supabase/migrations/202607290002_visits_multimedia.sql`
3. 在 Authentication > Users 复制两个用户的 UUID，然后以项目所有者身份在 SQL Editor 执行：

```sql
insert into public.couples (name) values ('测试情侣空间') returning id;
-- 将下面的 couple UUID 与两个 user UUID 替换为真实值。
insert into public.couple_members (couple_id, user_id) values
  ('COUPLE_UUID', 'USER_A_UUID'),
  ('COUPLE_UUID', 'USER_B_UUID');
```

4. 将 `.env.example` 复制为 `.env.local`，填入项目 URL、匿名密钥及 Cesium Ion Token；不要写入 service role key。
5. 重启开发服务。两名用户首次登录后可创建一条测试旅行，接着可重复到访同一城市，并在一段回忆中加入最多 20 张照片和 2 个视频。

媒体上限保存在 `public.couple_settings`。以后需要增加时，使用 SQL Editor 更新对应情侣空间，例如：

```sql
update public.couple_settings
set max_images_per_memory = 30,
    max_videos_per_memory = 4,
    updated_at = now()
where couple_id = 'COUPLE_UUID';
```

左下角“数据与备份”可导出包含私有媒体本体的完整备份。恢复前会检查格式、情侣空间 ID 和每个媒体文件的 SHA-256；恢复只补回缺失记录，不覆盖现有记录，也不会修改情侣成员权限。

第三个用户即使能在 Auth 后台存在，也不会有 `couple_members` 关系，因此无法读取或写入任何情侣空间数据。
