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

export interface RecipeDetailsAdditionalInformationJSON {
  content: string;
}

export interface RecipeDetailsCategoryJSON {
  id: string;
  title: string;
  subtitle: string;
}

export interface RecipeDetailsCollectionJSON {
  id: string;
  title: string;
  recipesCount: { value: number };
}

export interface RecipeDetailsIngredientGroupJSON {
  recipeIngredients: IngredientJSON[];
}

export interface RecipeDetailsStepJSON {
  formattedText: string;
  title: string;
}

export interface RecipeDetailsStepGroupJSON {
  title: string;
  recipeSteps: RecipeDetailsStepJSON[];
}

export interface RecipeDetailsUtensilsJSON {
  utensilNotation: string;
}

export interface RecipeDetailsServingSizeJSON {
  quantity: QuantityJSON;
  unitNotation: string;
}

export interface RecipeDetailsTimeJSON {
  quantity: QuantityJSON;
  type: string;
  comment: string;
}

export interface RecipeDetailsNutritionJSON {
  number: number;
  type: string;
  unittype: string;
}

export interface RecipeDetailsRecipeNutritionJSON {
  nutritions: RecipeDetailsNutritionJSON[];
  quantity: number;
  unitNotation: string;
}

export interface RecipeDetailsNutritionGroupJSON {
  name: string;
  recipeNutritions: RecipeDetailsRecipeNutritionJSON[];
}

export interface RecipeDetailsJSON {
  id: string;
  title: string;
  difficulty: string;
  additionalInformation: RecipeDetailsAdditionalInformationJSON[];
  categories: RecipeDetailsCategoryJSON[];
  inCollections: RecipeDetailsCollectionJSON[];
  recipeIngredientGroups: RecipeDetailsIngredientGroupJSON[];
  recipeStepGroups?: RecipeDetailsStepGroupJSON[];
  recipeUtensils: RecipeDetailsUtensilsJSON[];
  servingSize: RecipeDetailsServingSizeJSON;
  times: RecipeDetailsTimeJSON[];
  nutritionGroups?: RecipeDetailsNutritionGroupJSON[];
  descriptiveAssets?: DescriptiveAssetJSON[] | null;
}

export interface SearchRecipeHitJSON {
  id?: string;
  title?: string;
  name?: string;
  descriptiveAssets?: DescriptiveAssetJSON[] | null;
}

export interface SearchResultJSON {
  data?: SearchRecipeHitJSON[];
  recipes?: SearchRecipeHitJSON[];
  total?: number;
}

export interface CustomRecipeYieldJSON {
  value: number;
  unitText: string;
}

export interface CustomRecipeTextJSON {
  text: string;
}

/**
 * The two accept headers Cookidoo's custom-recipe endpoints return shape
 * this differently: `totalTime`/`prepTime` as either an ISO-8601 duration
 * string or a plain number of seconds; `tool`/`recipeYield`/`recipeIngredient`/
 * `recipeInstructions` vs. `tools`/`yield`/`ingredients`/`instructions`.
 * Every field is therefore optional except `name`.
 */
export interface CustomRecipeContentJSON {
  name: string;
  totalTime?: string | number;
  prepTime?: string | number;
  tool?: string[];
  tools?: string[];
  recipeYield?: CustomRecipeYieldJSON;
  yield?: CustomRecipeYieldJSON;
  recipeIngredient?: (string | CustomRecipeTextJSON)[];
  ingredients?: (string | CustomRecipeTextJSON)[];
  recipeInstructions?: (string | CustomRecipeTextJSON)[];
  instructions?: (string | CustomRecipeTextJSON)[];
  image?: string | null;
}

export interface CustomRecipeJSON {
  recipeId: string;
  title?: string;
  recipeContent: CustomRecipeContentJSON;
}

export interface CustomRecipesJSON {
  items: CustomRecipeJSON[];
}
