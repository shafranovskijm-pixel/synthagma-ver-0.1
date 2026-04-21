UPDATE public.webinars
SET source_type = 'livekit',
    player_settings = jsonb_set(
      COALESCE(player_settings, '{}'::jsonb),
      '{livekit}',
      jsonb_build_object(
        'roomName', 'wbn_21401a55-835c-4942-8465-f0fdc2003ddd_k9e3',
        'wsUrl', 'wss://sintagma-h5kuy8k3.livekit.cloud'
      )
    )
WHERE id = 'b6f98111-5047-4637-8d50-ac5064bde1a1';