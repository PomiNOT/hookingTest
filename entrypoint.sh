#!/usr/bin/dumb-init /bin/sh
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 -socket /tmp/tailscale.socket &
tailscale --socket /tmp/tailscale.socket up --authkey=${TAILSCALE_AUTHKEY} --hostname=${TAILSCALE_HOSTNAME} --exit-node=${TAILSCALE_EXIT_NODE_IP} &&
echo Started Tailscale &&
ALL_PROXY=socks5://localhost:1055 npm run start-prod
