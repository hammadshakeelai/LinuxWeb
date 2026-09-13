// Files the page and /usr/local/bin/linuxweb-helper exchange (spec section 5).
export const EXCHANGE_DIR = "/.linuxweb";
export const HOME_ARCHIVE = `${EXCHANGE_DIR}/home.tar.gz`;
export const HOME_VERSION = `${EXCHANGE_DIR}/home.version`;
export const RESTORE_ARCHIVE = `${EXCHANGE_DIR}/restore.tar.gz`;
export const RESTORED_COUNT = `${EXCHANGE_DIR}/restored`;
export const TERMINAL_SIZE = `${EXCHANGE_DIR}/size`;
export const NETWORK_STATE = `${EXCHANGE_DIR}/network`;
export const PACKAGES_STATUS = `${EXCHANGE_DIR}/packages-status`;
export const PACKAGES_LIST = "/root/.config/linuxweb/packages";

export const POLL_INTERVAL_MS = 2000;
export const HOME_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;
export const MAX_MACHINE_SAVES = 5;
export const SAVE_LOCK_NAME = "linuxweb-save";
