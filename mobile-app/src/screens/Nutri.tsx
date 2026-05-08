import { useMemo, useState } from 'react';
import { Card, Eyebrow, PrimaryAction, ScreenTitle, SecondaryAction, Sub, Title, inputStyle, screenTopStyle } from '../components/ui';

type Tab = 'day' | 'grocery' | 'recipes' | 'assets';
type AssetType = 'plan' | 'meal' | 'template' | 'playlist';

type GroceryItem = {
  id: string;
  section: string;
  label: string;
  amount: string;
  checked: boolean;
};

type Recipe = {
  id: string;
  date: string;
  title: string;
  meta: string;
  ingredients: Array<{ label: string; amount: string; section: string }>;
};

type PlanAsset = {
  id: string;
  type: AssetType;
  title: string;
  category: string;
  summary: string;
};

const assetTypes: AssetType[] = ['plan', 'meal', 'template', 'playlist'];
const categoryOptions = ['PERFORMANCE', 'FAT LOSS', 'MASS PHASE', 'ENDURANCE', 'PLANT-BASED', 'RECOVERY', 'RACE WEEK'];

const dayPlan = [
  { time: '07:20', tag: 'BFAST', title: 'Oats, berries, whey', meta: '412 kcal - 32P - 58C - 8F', logged: true },
  { time: '10:30', tag: 'SNACK', title: 'Whey shake', meta: '156 kcal - 28P - 4C - 2F', logged: true },
  { time: '12:40', tag: 'LUNCH', title: 'Chicken bowl + rice', meta: '620 kcal - 48P - 72C - 14F', logged: false },
  { time: '16:00', tag: 'SNACK', title: 'Greek yogurt + almonds', meta: '280 kcal - 22P - 18C - 12F', logged: false },
  { time: '19:30', tag: 'DINR', title: 'Salmon, quinoa, greens', meta: '580 kcal - 44P - 48C - 22F', logged: false },
];

const recipes: Recipe[] = [
  {
    id: 'tahini-chicken',
    date: 'F 21',
    title: 'Tahini chicken bowl',
    meta: '5 ingredients - 35 min - batch x4',
    ingredients: [
      { label: 'Chicken thigh', amount: '180 g', section: 'Protein' },
      { label: 'Jasmine rice', amount: '150 g', section: 'Pantry' },
      { label: 'Roast veg medley', amount: '120 g', section: 'Produce' },
      { label: 'Tahini', amount: '15 g', section: 'Pantry' },
      { label: 'Lemon', amount: '1', section: 'Produce' },
    ],
  },
  {
    id: 'sweet-potato-chili',
    date: 'M 17',
    title: 'Sweet potato chili',
    meta: '6 ingredients - 35 min - batch x4',
    ingredients: [
      { label: 'Sweet potato', amount: '2', section: 'Produce' },
      { label: 'Black beans', amount: '1 can', section: 'Pantry' },
      { label: 'Ground turkey', amount: '1 lb', section: 'Protein' },
    ],
  },
  {
    id: 'steak-rice',
    date: 'T 20',
    title: 'Steak + jasmine rice',
    meta: '4 ingredients - 12 min - pan-sear',
    ingredients: [
      { label: 'Sirloin steak', amount: '180 g', section: 'Protein' },
      { label: 'Jasmine rice', amount: '150 g', section: 'Pantry' },
      { label: 'Kale', amount: '100 g', section: 'Produce' },
    ],
  },
];

const initialGroceryItems: GroceryItem[] = [
  { id: 'spinach', section: 'Produce', label: 'Baby spinach', amount: '2 bags', checked: false },
  { id: 'blueberries', section: 'Produce', label: 'Blueberries', amount: '2 pints', checked: true },
  { id: 'broccoli', section: 'Produce', label: 'Broccoli', amount: '2 heads', checked: false },
  { id: 'chicken', section: 'Protein', label: 'Chicken breast', amount: '2.5 lb', checked: false },
  { id: 'salmon', section: 'Protein', label: 'Wild salmon', amount: '1.2 lb', checked: false },
  { id: 'rice', section: 'Pantry', label: 'Jasmine rice', amount: '2 lb', checked: false },
];

const initialAssets: PlanAsset[] = [
  {
    id: 'race-week',
    type: 'plan',
    title: 'Race week fueling',
    category: 'ENDURANCE',
    summary: 'Higher-carb build with low-fiber final 24 hours.',
  },
  {
    id: 'protein-led-cut',
    type: 'template',
    title: 'Protein-led cut',
    category: 'FAT LOSS',
    summary: 'Weekly macro template with meal timing anchors.',
  },
];

export default function Nutri() {
  const [tab, setTab] = useState<Tab>('day');
  const [groceryTitle, setGroceryTitle] = useState('Tahini chicken bowl');
  const [groceryItems, setGroceryItems] = useState(initialGroceryItems);
  const [assets, setAssets] = useState(initialAssets);
  const [assetType, setAssetType] = useState<AssetType>('plan');
  const [assetTitle, setAssetTitle] = useState('');
  const [assetCategory, setAssetCategory] = useState('PERFORMANCE');
  const [customCategory, setCustomCategory] = useState('');

  const groupedGrocery = useMemo(() => {
    return groceryItems.reduce<Record<string, GroceryItem[]>>((groups, item) => {
      groups[item.section] = [...(groups[item.section] ?? []), item];
      return groups;
    }, {});
  }, [groceryItems]);

  const checkedCount = groceryItems.filter((item) => item.checked).length;

  function toggleGrocery(id: string) {
    setGroceryItems((current) =>
      current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  }

  function resetGrocery() {
    setGroceryItems((current) => current.map((item) => ({ ...item, checked: false })));
  }

  function addRecipeToGrocery(recipe: Recipe) {
    const nextItems = recipe.ingredients.map((ingredient, index) => ({
      id: `${recipe.id}-${index}`,
      section: ingredient.section,
      label: ingredient.label,
      amount: ingredient.amount,
      checked: false,
    }));
    setGroceryTitle(recipe.title);
    setGroceryItems(nextItems);
    setTab('grocery');
  }

  function saveAsset() {
    const title = assetTitle.trim();
    if (!title) return;
    setAssets((current) => [
      {
        id: `${assetType}-${Date.now()}`,
        type: assetType,
        title,
        category: assetCategory,
        summary: `${assetCategory.toLowerCase()} ${assetType} draft ready to customize.`,
      },
      ...current,
    ]);
    setAssetTitle('');
  }

  function applyCustomCategory() {
    const nextCategory = customCategory.trim();
    if (!nextCategory) return;
    setAssetCategory(nextCategory.toUpperCase());
    setCustomCategory('');
  }

  return (
    <div style={screenTopStyle}>
      <ScreenTitle>Nutrition</ScreenTitle>
      <TabRow active={tab} onChange={setTab} />

      {tab === 'day' && (
        <>
          <Card>
            <Eyebrow>DAY BRIEF</Eyebrow>
            <Title>Pull day. Full plates.</Title>
            <Sub>1,568 / 2,100 kcal - 118g protein - 186g carbs - 52g fat.</Sub>
          </Card>
          <Card>
            <Eyebrow>THE DAY'S PLAN</Eyebrow>
            <div style={{ display: 'grid', gap: 10 }}>
              {dayPlan.map((item) => (
                <div key={`${item.time}-${item.title}`} style={planRowStyle}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{item.time}</span>
                  <span>
                    <span style={mealTagStyle}>{item.tag}</span>
                    <strong style={{ display: 'block', marginTop: 5 }}>{item.title}</strong>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{item.meta}</span>
                  </span>
                  <button type="button" style={item.logged ? loggedButtonStyle : logButtonStyle}>
                    {item.logged ? 'Logged' : 'Log'}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'grocery' && (
        <Card>
          <div style={headerRowStyle}>
            <div>
              <Eyebrow>GROCERY LIST</Eyebrow>
              <Title>{groceryTitle}</Title>
              <Sub>{checkedCount} / {groceryItems.length} checked</Sub>
            </div>
            <SecondaryAction onClick={resetGrocery} style={{ marginTop: 0 }}>
              Reset
            </SecondaryAction>
          </div>
          {Object.entries(groupedGrocery).map(([section, items]) => (
            <div key={section} style={{ marginTop: 16 }}>
              <Eyebrow>{section}</Eyebrow>
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map((item) => (
                  <button key={item.id} type="button" onClick={() => toggleGrocery(item.id)} style={groceryRowStyle}>
                    <span style={item.checked ? checkedBoxStyle : emptyBoxStyle}>{item.checked ? 'x' : ''}</span>
                    <span style={{ textDecoration: item.checked ? 'line-through' : 'none' }}>{item.label}</span>
                    <span style={{ color: 'var(--muted)' }}>{item.amount}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      {tab === 'recipes' && (
        <Card>
          <Eyebrow>RECIPE ARCHIVE</Eyebrow>
          <div style={{ display: 'grid', gap: 10 }}>
            {recipes.map((recipe) => (
              <div key={recipe.id} style={recipeCardStyle}>
                <div>
                  <span style={{ color: 'var(--teal-bright)', fontFamily: 'var(--mono)', fontSize: 11 }}>{recipe.date}</span>
                  <Title>{recipe.title}</Title>
                  <Sub>{recipe.meta}</Sub>
                </div>
                <PrimaryAction onClick={() => addRecipeToGrocery(recipe)} style={{ marginTop: 12 }}>
                  Add ingredients
                </PrimaryAction>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'assets' && (
        <>
          <Card>
            <Eyebrow>NUTRITIONIST BUILDER</Eyebrow>
            <Title>New asset</Title>
            <Sub>Create plans, meals, templates, or playlist-supported assets for clients.</Sub>
            <div style={tagWrapStyle}>
              {assetTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAssetType(type)}
                  style={pillStyle(assetType === type)}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
            <input
              value={assetTitle}
              onChange={(event) => setAssetTitle(event.target.value)}
              placeholder="Asset title"
              style={{ ...inputStyle, marginTop: 12 }}
            />
            <div style={tagWrapStyle}>
              {[...categoryOptions, ...(categoryOptions.includes(assetCategory) ? [] : [assetCategory])].map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setAssetCategory(category)}
                  style={pillStyle(assetCategory === category)}
                >
                  {category}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 12 }}>
              <input
                value={customCategory}
                onChange={(event) => setCustomCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyCustomCategory();
                }}
                placeholder="Custom category"
                style={inputStyle}
              />
              <button type="button" onClick={applyCustomCategory} style={smallActionStyle}>Use</button>
            </div>
            <PrimaryAction onClick={saveAsset}>Save draft</PrimaryAction>
          </Card>

          <Card>
            <Eyebrow>ASSET LIBRARY</Eyebrow>
            <div style={{ display: 'grid', gap: 10 }}>
              {assets.map((asset) => (
                <div key={asset.id} style={assetRowStyle}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal-bright)', fontSize: 10 }}>{asset.category}</span>
                  <strong>{asset.title}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{asset.summary}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function TabRow({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'day', label: 'Day' },
    { key: 'grocery', label: 'Grocery' },
    { key: 'recipes', label: 'Recipes' },
    { key: 'assets', label: 'Assets' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, margin: '14px 0' }}>
      {tabs.map((item) => (
        <button key={item.key} type="button" onClick={() => onChange(item.key)} style={pillStyle(active === item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function pillStyle(active: boolean) {
  return {
    minHeight: 34,
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
    background: active ? 'var(--teal)' : 'transparent',
    color: active ? 'var(--paper)' : 'var(--ink)',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.08em',
    padding: '8px 10px',
  };
}

const headerRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
};

const planRowStyle = {
  display: 'grid',
  gridTemplateColumns: '48px minmax(0, 1fr) auto',
  gap: 10,
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
};

const mealTagStyle = {
  display: 'inline-flex',
  borderRadius: 999,
  background: 'rgba(52,211,197,0.18)',
  color: 'var(--teal-bright)',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  padding: '3px 7px',
};

const logButtonStyle = {
  border: '1px solid var(--border)',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--ink)',
  padding: '8px 10px',
  fontSize: 12,
};

const loggedButtonStyle = {
  ...logButtonStyle,
  borderColor: 'rgba(52,211,197,0.35)',
  background: 'rgba(52,211,197,0.16)',
  color: 'var(--teal-bright)',
};

const groceryRowStyle = {
  display: 'grid',
  gridTemplateColumns: '24px minmax(0, 1fr) auto',
  gap: 10,
  alignItems: 'center',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'transparent',
  color: 'var(--ink)',
  padding: 10,
  textAlign: 'left' as const,
  fontFamily: 'inherit',
};

const emptyBoxStyle = {
  width: 20,
  height: 20,
  border: '1px solid var(--muted)',
  borderRadius: 5,
};

const checkedBoxStyle = {
  ...emptyBoxStyle,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(52,211,197,0.18)',
  borderColor: 'var(--teal)',
  color: 'var(--teal-bright)',
  fontSize: 11,
};

const recipeCardStyle = {
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 14,
  background: 'rgba(242,237,228,0.03)',
};

const tagWrapStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 8,
  marginTop: 12,
};

const smallActionStyle = {
  border: 0,
  borderRadius: 10,
  padding: '0 14px',
  background: 'var(--teal)',
  color: 'var(--paper)',
  fontFamily: 'inherit',
  fontSize: 13,
};

const assetRowStyle = {
  display: 'grid',
  gap: 4,
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 12,
};
