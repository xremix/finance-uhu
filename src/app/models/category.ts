
import { Transaction } from "./transaction";

export interface BaseCategory{
    name: string;
    type: 'savings' | 'income' | 'expense';
    keywords: string[];
    correctionKeywords?: string[];
    excludeKeywords: string[];
    subCategories: BaseCategory[];
    isDefault?: boolean;
    icon?: string;
    lowPrio?: boolean;
}

export interface Category extends BaseCategory{
    name: string;
    type: 'savings' | 'income' | 'expense';
    keywords: string[];
    correctionKeywords: string[];
    excludeKeywords: string[];
    subCategories: Category[];
    total: number;
    transactions: Transaction[];
    isDefault?: boolean;
    icon?: string;
    lowPrio?: boolean;
}
export function mapCategoryToBaseCategory(category: Category): BaseCategory{
    var baseCategory: BaseCategory = {
        name: category.name,
        type: category.type,
        keywords: category.keywords,
        correctionKeywords: category.correctionKeywords || [],
        excludeKeywords: category.excludeKeywords,
        subCategories: category.subCategories.map(mapCategoryToBaseCategory),
        isDefault: category.isDefault,
        icon: category.icon,
        lowPrio: category.lowPrio
    }
    return baseCategory;
}

export function mapBaseCategoryToCategory(baseCategory: BaseCategory): Category{
    var category: Category = {
        name: baseCategory.name,
        type: baseCategory.type,
        keywords: baseCategory.keywords,
        correctionKeywords: baseCategory.correctionKeywords || [],
        excludeKeywords: baseCategory.excludeKeywords,
        subCategories: baseCategory.subCategories.map(mapBaseCategoryToCategory),
        total: 0,
        transactions: [],
        isDefault: baseCategory.isDefault,
        icon: baseCategory.icon,
        lowPrio: baseCategory.lowPrio
    }
    return category;
}
