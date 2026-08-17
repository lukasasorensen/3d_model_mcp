# Production renderer provenance

The production adapter accepts only an OpenSCAD OCI image referenced by an exact
`sha256:` digest and a BOSL2 tree whose independently computed digest matches the
configured pin. The values are deployment inputs because CP-2 is still open; tags,
floating branches, and native OpenSCAD are rejected by the production adapter.

Required runtime policy: rootless Docker/Podman or a VM-backed engine, non-root UID,
network `none`, read-only root and input/BOSL2 mounts, a distinct initially empty
output mount, all capabilities dropped, no-new-privileges plus seccomp, 512 MiB RAM,
one CPU, 128 PIDs, a 60-second wall timeout, 1 MiB stdout/stderr capture, 10 MiB STL,
25 MiB 3MF, and 250,000 preview triangles. Effective `inspect` values are checked
after container creation; requested flags alone are not accepted as evidence.

Real-runtime smoke tests are intentionally a separate strict release gate. Unit
tests use an injected deterministic controller and do not claim OCI isolation.
