{pkgs}: {
  deps = [
    pkgs.dbus
    pkgs.cups
    pkgs.atk
    pkgs.pango
    pkgs.alsa-lib
    pkgs.nspr
    pkgs.nss
    pkgs.xorg.libxcb
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.chromium
  ];
}
