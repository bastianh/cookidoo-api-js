/**
 * Raw JSON shapes as returned by the Cookidoo backend.
 *
 * Only the shapes actually consumed so far are declared here (and only the
 * fields actually used -- the live responses carry more than what's typed
 * below); more are added as more API methods are ported from the Python
 * client.
 */

export interface CommunityProfileJSON {
  id: string;
  userInfo: {
    username: string;
    description?: string | null;
    picture: string | null;
  };
}

export interface QuantityJSON {
  value: number | null;
  from: number | null;
  to: number | null;
}

export interface AdditionalItemJSON {
  id: string;
  name: string;
  isOwned: boolean;
}

export interface ItemJSON {
  id: string;
  ingredientNotation: string;
  isOwned: boolean;
  quantity: QuantityJSON | null;
  unitNotation: string | null;
}

/**
 * An ingredient as it appears in a recipe's own ingredient groups (e.g.
 * `recipe:details`), distinct from an {@link ItemJSON} (a shopping-list
 * entry). Identified by `localId` rather than `id`.
 */
export interface IngredientJSON {
  localId: string;
  ingredientNotation: string;
  quantity: QuantityJSON | null;
  unitNotation: string | null;
}

export interface DescriptiveAssetJSON {
  square?: string | null;
  portrait?: string | null;
  landscape?: string | null;
  [variant: string]: string | null | undefined;
}

export interface RecipeJSON {
  id: string;
  title: string;
  recipeIngredientGroups: ItemJSON[];
  descriptiveAssets?: DescriptiveAssetJSON[] | null;
}
