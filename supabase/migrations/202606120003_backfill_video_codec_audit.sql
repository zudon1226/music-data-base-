alter table public.videos
  add column if not exists video_codec text,
  add column if not exists audio_codec text,
  add column if not exists mobile_compatible boolean;

create index if not exists videos_mobile_compatible_idx
on public.videos (mobile_compatible);

create index if not exists videos_video_codec_idx
on public.videos (video_codec);

update public.videos
set
  video_codec = 'avc1',
  audio_codec = 'mp4a',
  mobile_compatible = true
where id = '6fdbb83c-dd72-41e5-8127-017ff0991264';

update public.videos
set
  video_codec = 'av01',
  audio_codec = 'mp4a',
  mobile_compatible = false
where id in (
  'd422efef-f125-434a-8281-c7247788ae8b',
  'f3eda9a5-7aae-4854-88f5-b269c2c2ae23',
  '79dd8e07-86b4-45b1-8ab2-c95abbcf821a',
  'faa6791d-35b0-49ab-b8b3-f9115b055c8e',
  'f3b6f827-6a67-4e68-ba2c-c55d1fb97b59',
  '6fda9497-7c6c-4427-bcfd-8055ee7abf04',
  '1c934056-14f4-49ed-916c-ecdc43c906d2',
  '90f1920d-1dc4-423c-b646-ca1615130623',
  'bd0bc959-6d41-4e29-854f-02f07cd6e12e',
  '08ded070-d365-4c5c-a4d7-6a2b062a2994',
  'f5306a67-f76b-4e0a-a10c-599c7f115f3a',
  '2a6301c8-25a6-416a-bb2d-fbdeee246307',
  '971e1746-5538-4210-adcf-13420d9f6f98',
  'df2f3f84-dad4-43d6-9a55-e60c1052329d',
  'a3c11bd9-68f0-49e2-b910-5c0e2031e62b',
  '8a0ea9cc-c5f0-411b-9800-0c8a6453ea1a',
  'd3178c91-6d38-4de0-9766-0e5c5df23d1f',
  '4fc10a0e-ea2e-45f7-ae0f-d9070f96e497',
  'da05e8d3-08c2-47a2-8004-1d53c27c44e2',
  '30dbe1d5-99dc-4ea4-aaaf-273db7d364e3',
  '06b43724-12bb-4f41-b552-3553d30f15ad'
);
