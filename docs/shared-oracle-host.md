# Sharing an existing Oracle server

Houselights can share a Linux VM with existing workloads if measurements show
enough spare capacity. A 2-OCPU, 12-GB A1 configuration alone does not establish
that capacity. Oracle's [current Always Free documentation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
lists that allocation for A1; confirm remaining allowance in the account before
creating another instance. Do not resize the active livestream server merely to
make room for a second VM.

## Inspect before changing the server

From an existing SSH session, run the read-only script from a reviewed checkout:

```sh
sh scripts/host-capacity.sh
```

It reports architecture, CPU count, memory, disk space, a short CPU/I/O sample,
listening TCP endpoints and Docker availability. It does not install software,
read credentials, restart services, print process arguments or change the host.
Review the VM's normal and peak livestream metrics as well; five samples cannot
establish peak headroom.

The existing web proxy and port ownership must be identified before choosing
ingress. A public IP and instance list do not supply SSH access. Use an existing
SSH alias or the owner's login and local key file; keep key contents private.
Only inspect explicitly provided connection configuration.

## Deployment profile

`deploy/free-vm/shared.compose.yaml` contains the application only. It binds to
`127.0.0.1:18080`, leaves ports 80/443 available for a separately configured
proxy, and uses its own Compose project and named data volume. It sets initial
runtime limits of 0.5 CPU, 1536 MiB RAM, no extra swap allowance, 256
processes/threads and three 10-MB container log files. These are starting limits
to validate under load, not measured production requirements or a guarantee of
no interference. The database and Docker image storage are not limited by log
rotation.

Use the private configuration described in [free-hosting.md](free-hosting.md).
After inspecting headroom, the runtime command is:

```sh
docker compose --env-file /etc/houselights.env -f deploy/free-vm/shared.compose.yaml up --build -d
```

**The runtime limits do not limit the image build.** Schedule the build during
confirmed spare capacity or load an image built for the same architecture off
the live server, then use `up --no-build -d`. A dedicated Docker-container
BuildKit builder can also cap its own CPU and memory; verify those limits before
building. Do not prune existing Docker images or volumes to make space without
identifying their owners.

For public access, a host HTTPS proxy or an existing named tunnel must route a
dedicated Houselights hostname to `127.0.0.1:18080`. For a Caddy process running
directly on the host, the additional site block is:

```caddyfile
houselights.YOUR_DOMAIN {
    reverse_proxy 127.0.0.1:18080
}
```

This is a separate site block, not a replacement for existing configuration.
Validate the complete configuration before a graceful reload. If the existing
proxy runs inside Docker, its loopback is not the host loopback; inspect its
network and prepare the appropriate route instead of applying this snippet.
Keep streaming responses unbuffered and preserve Authorization headers. Proxy
trust is configured for one ingress hop; verify the actual chain.

If ports 80/443 are unused, `shared-public.override.yaml` adds a separate,
bounded Caddy container without modifying an existing tunnel:

```sh
docker compose --env-file /etc/houselights.env -f deploy/free-vm/shared.compose.yaml -f deploy/free-vm/shared-public.override.yaml up --no-build -d
```

For a demo without an owned domain, [sslip.io/nip.io](https://nip.io/) can resolve
a hostname containing the server's public IP. Set `PUBLIC_HOSTNAME` to that
hostname only after confirming its DNS resolution. This relies on a third-party
DNS service and on the server keeping that IP; it is not domain ownership.
Certificate issuance needs external reachability and remains subject to the
CA's limits. Verify both the VM's firewall and OCI security lists/network
security groups. Do not open the application or database ports to the internet.

Run the release HTTP, saved-job restart and backup/restore checks from the
free-hosting runbook using `shared.compose.yaml` in every command. Also confirm
that the bot and livestream still behave normally during a bounded Houselights
run. No source-controlled command logs into, resizes or restarts an existing
Oracle instance automatically.

## ARM verification

The release workflow runs on standard public-repository x86 and native ARM64
GitHub runners. Both build the image, start this shared profile with isolated
synthetic configuration, check the actual container limits and loopback binding,
complete a proof job, recreate the container with its volume and verify
backup/restore. Inspect the run result for the exact deployment commit.
CI success does not establish capacity, DNS or TLS on the existing Oracle VM.
