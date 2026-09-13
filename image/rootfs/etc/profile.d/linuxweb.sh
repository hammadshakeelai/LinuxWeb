# BusyBox ash and bash both have a built-in "help"; show the LinuxWeb tour instead.
alias help=linuxweb-help
export TERM=xterm-256color
# Keep the v1 prompt (localhost:~# ) for every login shell.
PS1='\h:\w\$ '
