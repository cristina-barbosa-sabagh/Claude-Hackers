-- v15: crear fila en referrals automáticamente al crear perfil con referred_by,
-- copiando ref_channel desde profiles_usuarios. Reemplaza registerReferral (cliente).
-- Activacion al CREAR LA CUENTA con el link, no al completar leccion.
-- (Ya aplicado en Supabase el 2026-06-23.)

create or replace function public.create_referral_on_profile()
returns trigger
language plpgsql
security definer
as $$
declare
  v_referrer_id uuid;
begin
  if new.referred_by is null then
    return new;
  end if;
  select id into v_referrer_id
  from public.profiles_usuarios
  where codigo_referral = new.referred_by
  limit 1;
  if v_referrer_id is null or v_referrer_id = new.id then
    return new;
  end if;
  insert into public.referrals (referrer_id, referred_id, activated, ref_channel)
  values (v_referrer_id, new.id, true, new.ref_channel)
  on conflict (referrer_id, referred_id)
  do update set activated = true,
                ref_channel = coalesce(public.referrals.ref_channel, excluded.ref_channel);
  return new;
end;
$$;

drop trigger if exists trg_create_referral on public.profiles_usuarios;
create trigger trg_create_referral
  after insert on public.profiles_usuarios
  for each row execute function public.create_referral_on_profile();
