begin;

alter table public.profiles drop constraint if exists profiles_tichu_expression_check;
alter table public.profiles drop constraint if exists profiles_tichu_outfit_check;
alter table public.profiles add constraint profiles_tichu_expression_check check(tichu_expression between 0 and 7);
alter table public.profiles add constraint profiles_tichu_outfit_check check(tichu_outfit between 0 and 11);

create or replace function public.tichu_set_avatar(p_hair int,p_skin int,p_hair_color int,p_expression int,p_outfit int,p_accessory int,p_frame int)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_hair not between 0 and 15 or p_skin not between 0 and 9 or p_hair_color not between 0 and 7 or p_expression not between 0 and 7 or p_outfit not between 0 and 11 or p_accessory not between 0 and 15 or p_frame not between 0 and 7 then
   raise exception '올바른 아바타 조합을 선택해 주세요.';
 end if;
 update public.profiles set tichu_avatar=p_hair,tichu_skin=p_skin,tichu_hair_color=p_hair_color,
   tichu_expression=p_expression,tichu_outfit=p_outfit,tichu_accessory=p_accessory,
   tichu_frame=p_frame,updated_at=now() where id=auth.uid();
 if not found then raise exception '프로필을 먼저 저장해 주세요.'; end if;
 return jsonb_build_object('hair',p_hair,'skin',p_skin,'hairColor',p_hair_color,'expression',p_expression,'outfit',p_outfit,'accessory',p_accessory,'frame',p_frame);
end $$;

revoke all on function public.tichu_set_avatar(int,int,int,int,int,int,int) from public,anon;
grant execute on function public.tichu_set_avatar(int,int,int,int,int,int,int) to authenticated;

commit;
