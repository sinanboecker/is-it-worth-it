import { deviceGroups } from "./inputs";

test("devices are grouped in the categories' sort order, unknown categories last", () => {
  const categories = [
    { id: 3, name: "PC" }, // sort order 0
    { id: 1, name: "Nintendo" }, // sort order 1
  ];
  const devices = [
    { id: 10, name: "Switch", category_id: 1 },
    { id: 11, name: "Gaming PC", category_id: 3 },
    { id: 12, name: "Old thing", category_id: 99 },
    { id: 13, name: "Steam Deck", category_id: 3 },
  ];
  expect(deviceGroups(devices, categories)).toEqual([
    { group: "PC", items: [{ value: "11", label: "Gaming PC" }, { value: "13", label: "Steam Deck" }] },
    { group: "Nintendo", items: [{ value: "10", label: "Switch" }] },
    { group: "Other", items: [{ value: "12", label: "Old thing" }] },
  ]);
});
