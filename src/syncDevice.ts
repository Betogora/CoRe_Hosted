import { getOrCreateSyncDeviceId } from "./accountStorage.ts";

function getNavigator(navigatorObject: any) {
  if (navigatorObject) return navigatorObject;
  if (typeof navigator !== "undefined") return navigator;
  return null;
}

function detectBrowser(userAgent: any) {
  if (/\b(?:Edg|EdgA|EdgiOS)\//i.test(userAgent)) return "Edge";
  if (/\b(?:Firefox|FxiOS)\//i.test(userAgent)) return "Firefox";
  if (/\b(?:Chrome|CriOS)\//i.test(userAgent)) return "Chrome";
  if (/\bSafari\//i.test(userAgent)) return "Safari";
  return "Browser";
}

function detectOperatingSystem(userAgent: any, navigatorObject: any) {
  if (/\bWindows NT\b/i.test(userAgent)) return "Windows";
  if (/\bAndroid\b/i.test(userAgent)) return "Android";
  if (/\bCrOS\b/i.test(userAgent)) return "ChromeOS";
  if (/\b(?:iPhone|iPad|iPod)\b/i.test(userAgent)) return "iOS";
  if (/\bMacintosh\b/i.test(userAgent) && Number(navigatorObject?.maxTouchPoints) > 1) return "iOS";
  if (/\b(?:Macintosh|Mac OS X)\b/i.test(userAgent)) return "macOS";
  if (/\bLinux\b/i.test(userAgent)) return "Linux";
  return null;
}

export function createBrowserSyncDevice({ storage = null, navigatorObject = null }: any = {}) {
  const resolvedNavigator = getNavigator(navigatorObject);
  const userAgent = typeof resolvedNavigator?.userAgent === "string"
    ? resolvedNavigator.userAgent
    : "";
  const browser = detectBrowser(userAgent);
  const operatingSystem = detectOperatingSystem(userAgent, resolvedNavigator);

  return {
    id: getOrCreateSyncDeviceId(storage),
    label: operatingSystem ? `${browser} auf ${operatingSystem}` : "Browser",
    userAgent,
  };
}
