# BusyBox ash and bash both have a built-in "help"; show the LinuxWeb tour instead.
alias help=linuxweb-help
export TERM=xterm-256color
# Keep the v1 prompt (localhost:~# ) for every login shell.
PS1='\h:\w\$ '

# bash: suggest the Alpine package for a missing command (network spec section 3).
if [ -n "$BASH_VERSION" ]; then
  command_not_found_handle() {
    local pkg
    pkg=$(awk -F '\t' -v cmd="$1" '$1 == cmd { print $2; exit }' /usr/local/share/linuxweb/commands.tsv 2>/dev/null)
    if [ -n "$pkg" ]; then
      echo "$1: command not found. Install it with: apk add $pkg" >&2
      if [ "$(cat /.linuxweb/network 2>/dev/null)" != online ]; then
        echo "(needs the network: set a relay with the Network button)" >&2
      fi
    else
      echo "-bash: $1: command not found" >&2
    fi
    return 127
  }
fi
