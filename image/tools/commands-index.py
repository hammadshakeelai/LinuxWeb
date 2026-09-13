"""Prints "command<TAB>package" for every cmd: provide in Alpine 3.21 x86 main and community.

When several packages provide a command, main wins, then the alphabetically first package.
"""
import io
import tarfile
import urllib.request

best = {}
for repo in ["main", "community"]:
    url = f"https://dl-cdn.alpinelinux.org/alpine/v3.21/{repo}/x86/APKINDEX.tar.gz"
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        text = archive.extractfile("APKINDEX").read().decode("utf-8")
    found = {}
    for block in text.split("\n\n"):
        fields = {}
        for line in block.splitlines():
            if len(line) > 2 and line[1] == ":":
                fields.setdefault(line[0], line[2:])
        name = fields.get("P")
        if not name:
            continue
        for provide in fields.get("p", "").split():
            if provide.startswith("cmd:"):
                command = provide[4:].split("=")[0]
                if command not in found or name < found[command]:
                    found[command] = name
    for command, name in found.items():
        best.setdefault(command, name)

for command in sorted(best):
    print(f"{command}\t{best[command]}")
