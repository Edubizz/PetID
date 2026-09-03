/**
 * Mobile sidebar helpers — close the sheet after navigation without delays.
 */

/** Close the mobile sheet when a nav destination (or logout) is activated. */
export function closeMobileSidebar(
  isMobile: boolean,
  setOpenMobile: (open: boolean) => void,
): void {
  if (isMobile) setOpenMobile(false);
}
