#!/usr/bin/dumb-init /bin/sh
tailscaled --tun=userspace-networking --socks5-server=127.0.0.1:1055 -socket /tmp/tailscale.socket &
tailscale --socket /tmp/tailscale.socket up --authkey=${TAILSCALE_AUTHKEY} --hostname=${TAILSCALE_HOSTNAME} --exit-node=${TAILSCALE_EXIT_NODE_IP} &&
echo Started Tailscale, waiting 30 seconds &&
sleep 30 &&
ALL_PROXY=socks5://127.0.0.1:1055 npm run start-prod
