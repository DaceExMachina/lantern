# Cloud spike (throwaway spike, delete after)

Set `LANTERN_SPIKE_URL` in the environment (full base URL including the secret path, `https://<host>:10000/spike/<TOKEN>`). Hooks do nothing when it is unset.

Manual ping:

    curl -sS -m 10 -X POST "$LANTERN_SPIKE_URL/manual"
