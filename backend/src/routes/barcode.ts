import { Router } from 'express';
import axios from 'axios';
import { prisma } from '../index';
import { auth } from '../middleware/auth';

const router = Router();
router.use(auth);

router.get('/:barcode', async (req, res) => {
  const { barcode } = req.params;

  // Check pantry first
  const pantryItem = await prisma.pantryItem.findFirst({ where: { barcode } });
  if (pantryItem) {
    res.json({ source: 'pantry', product: pantryItem });
    return;
  }

  // Look up in Open Food Facts
  try {
    const { data } = await axios.get(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { timeout: 5000 },
    );
    if (data.status === 1) {
      const p = data.product;
      res.json({
        source: 'openfoodfacts',
        product: {
          barcode,
          name: p.product_name || p.product_name_de || 'Unbekanntes Produkt',
          category: p.categories_tags?.[0]?.replace('en:', '') || null,
          quantity: p.quantity || null,
          imageUrl: p.image_small_url || null,
          brands: p.brands || null,
        },
      });
      return;
    }
  } catch {
    // OpenFoodFacts not reachable — return what we know
  }

  res.json({ source: 'unknown', product: { barcode, name: null } });
});

export default router;
