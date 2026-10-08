import type { ColorValue } from "react-native";
import Svg, { Rect } from "react-native-svg";

/**
 * Pixel-grid icons in the spirit of Autumn's site. Each icon is a 7x7 grid;
 * `#` is a filled cell.
 */
const ICONS = {
  home: ["...#...", "..###..", ".#####.", "#######", ".##.##.", ".##.##.", ".#####."],
  customers: ["..###..", "..###..", "..###..", ".......", ".#####.", "#######", "#######"],
  catalogue: ["###.###", "###.###", "###.###", ".......", "###.###", "###.###", "###.###"],
  settings: ["...#...", ".#.#.#.", "..###..", "###.###", "..###..", ".#.#.#.", "...#..."],
  chevronRight: [".......", "..#....", "...#...", "....#..", "...#...", "..#....", "......."],
  chevronDown: [".......", ".......", ".#...#.", "..#.#..", "...#...", ".......", "......."],
  plus: [".......", "...#...", "...#...", ".#####.", "...#...", "...#...", "......."],
  check: [".......", "......#", ".....#.", "#...#..", ".#.#...", "..#....", "......."],
  copy: ["####...", "#..#...", "#.####.", "#.#..#.", "###..#.", "..#..#.", "..####."],
  bell: ["...#...", "..###..", ".#####.", ".#####.", ".#####.", "#######", "...#..."],
  leaf: ["...####", "..##.##", ".##.###", ".#.####", ".####..", ".#.....", "#......"],
  search: [".###...", "#...#..", "#...#..", "#...#..", ".###...", ".....#.", "......#"],
  close: [".......", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "......."],
} as const satisfies Record<string, readonly string[]>;

export type PixelIconName = keyof typeof ICONS;

export function PixelIcon({
  name,
  size = 18,
  color,
}: {
  readonly name: PixelIconName;
  readonly size?: number;
  readonly color: ColorValue;
}) {
  const rows = ICONS[name];
  const cell = size / 7;
  const inset = cell * 0.08;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rows.flatMap((row, y) =>
        [...row].map((char, x) =>
          char === "#" ? (
            <Rect
              key={`${x}-${y}`}
              x={x * cell + inset}
              y={y * cell + inset}
              width={cell - inset * 2}
              height={cell - inset * 2}
              fill={color}
            />
          ) : null,
        ),
      )}
    </Svg>
  );
}
