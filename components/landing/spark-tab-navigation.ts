export function getNextSparkTabIndex(
  currentIndex: number,
  key: string,
  totalTabs: number,
) {
  if (totalTabs <= 0) return currentIndex;

  switch (key) {
    case "ArrowRight":
      return (currentIndex + 1) % totalTabs;
    case "ArrowLeft":
      return (currentIndex - 1 + totalTabs) % totalTabs;
    case "Home":
      return 0;
    case "End":
      return totalTabs - 1;
    default:
      return currentIndex;
  }
}
