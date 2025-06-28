import { Injectable } from '@nestjs/common';

@Injectable()
export class SensitiveInfoService {
  remove<T extends object, K extends keyof T>(
    source: T | T[],
    keysToRemove: readonly K[],
  ): Omit<T, K> | Omit<T, K>[] {
    const remove = (item: T): Omit<T, K> => {
      const result = { ...item } as Partial<T>;
      for (const key of keysToRemove) {
        delete result[key];
      }
      return result as Omit<T, K>;
    };

    if (Array.isArray(source)) {
      return source.map(remove);
    } else {
      return remove(source);
    }
  }
}
