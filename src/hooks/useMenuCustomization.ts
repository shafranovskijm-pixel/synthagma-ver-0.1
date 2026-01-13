import { useState, useEffect, useCallback } from "react";

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  visible: boolean;
  order: number;
}

export interface MenuCustomization {
  items: MenuItem[];
  isEditMode: boolean;
}

const STORAGE_KEY_PREFIX = "menuCustomization_";

export function useMenuCustomization(menuType: "student" | "admin" | "organization", defaultItems: MenuItem[]) {
  const storageKey = `${STORAGE_KEY_PREFIX}${menuType}`;
  
  const [items, setItems] = useState<MenuItem[]>(() => {
    if (typeof window === "undefined") return defaultItems;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as MenuItem[];
        // Merge with default items to handle new items added after save
        const mergedItems = defaultItems.map(defaultItem => {
          const savedItem = parsed.find(item => item.id === defaultItem.id);
          if (savedItem) {
            return { ...defaultItem, visible: savedItem.visible, order: savedItem.order };
          }
          return { ...defaultItem, order: parsed.length + defaultItem.order };
        });
        return mergedItems.sort((a, b) => a.order - b.order);
      } catch {
        return defaultItems;
      }
    }
    return defaultItems;
  });

  const [isEditMode, setIsEditMode] = useState(false);

  // Save to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  const reorderItems = useCallback((fromIndex: number, toIndex: number) => {
    setItems(prev => {
      const newItems = [...prev];
      const [movedItem] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, movedItem);
      // Update order values
      return newItems.map((item, index) => ({ ...item, order: index }));
    });
  }, []);

  const toggleVisibility = useCallback((itemId: string) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, visible: !item.visible } : item
    ));
  }, []);

  const showItem = useCallback((itemId: string) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, visible: true } : item
    ));
  }, []);

  const hideItem = useCallback((itemId: string) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, visible: false } : item
    ));
  }, []);

  const resetToDefault = useCallback(() => {
    setItems(defaultItems);
  }, [defaultItems]);

  const showAllItems = useCallback(() => {
    setItems(prev => prev.map(item => ({ ...item, visible: true })));
  }, []);

  const visibleItems = items.filter(item => item.visible);
  const hiddenItems = items.filter(item => !item.visible);

  return {
    items,
    visibleItems,
    hiddenItems,
    isEditMode,
    setIsEditMode,
    reorderItems,
    toggleVisibility,
    showItem,
    hideItem,
    resetToDefault,
    showAllItems,
  };
}
