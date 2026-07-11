export function getNextSettingsTabIndex(
  currentIndex: number,
  key: string,
  tabCount: number,
): number {
  if (tabCount <= 0) return currentIndex;
  if (key === "ArrowRight") return (currentIndex + 1) % tabCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + tabCount) % tabCount;
  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  return currentIndex;
}

export function isSettingsTabNavigationKey(key: string): boolean {
  return ["ArrowRight", "ArrowLeft", "Home", "End"].includes(key);
}
