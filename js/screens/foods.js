/**
 * My Foods: searchable list of every saved food, plus the entry point to add new ones.
 */
import { html, render } from '../lib/html.js';
import { listFoods, matchFoods, addFoods, setFavourite } from '../db/foods.js';
import { STARTER_FOODS } from '../lib/starter-foods.js';
import { foodRow, favouriteButton } from '../components/food-row.js';
import { icons } from '../components/icons.js';
import { toast } from '../components/toast.js';

export default {
  title: 'Foods',

  async render(root, { refresh }) {
    const foods = await listFoods();

    if (foods.length === 0) {
      render(root, html`
        ${header()}
        <div class="empty">
          <p class="empty__title">No foods yet</p>
          <p>Add the foods you eat most. Use values per 100g from the packet, or per item, like 1 egg.</p>
          <div class="empty__actions">
            <a class="btn btn--primary btn--block" href="#/food/new">${icons.plus} Add a food</a>
            <button class="btn btn--block" type="button" data-action="starter">Add 10 common starter foods</button>
          </div>
          <p class="small muted">Starter foods use typical values. Check them against your packets.</p>
        </div>
      `);
      root.querySelector('[data-action="starter"]').addEventListener('click', async () => {
        await addFoods(STARTER_FOODS, 'starter');
        toast('Added 10 starter foods');
        refresh();
      });
      return;
    }

    render(root, html`
      ${header()}
      <label class="search">
        ${icons.search}
        <input type="search" id="food-search" placeholder="Search ${foods.length} foods"
          autocomplete="off" enterkeyhint="search" aria-label="Search foods">
      </label>
      <ul class="list" id="food-list"></ul>
    `);

    const list = root.querySelector('#food-list');
    const drawList = (query = '') => {
      const matches = matchFoods(foods, query);
      render(list, matches.length
        ? matches.map(foodRow)
        : html`<li class="list__empty">No foods match “${query}”. <a href="#/food/new?name=${encodeURIComponent(query)}">Add it</a></li>`);
    };
    drawList();
    root.querySelector('#food-search').addEventListener('input', (event) => drawList(event.target.value));

    // ☆ toggles a favourite in place.
    list.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="favourite"]');
      if (!button) return;
      const food = foods.find((f) => f.id === button.closest('[data-food-id]').dataset.foodId);
      food.isFavourite = !food.isFavourite;
      await setFavourite(food.id, food.isFavourite);
      button.outerHTML = String(favouriteButton(food));
      toast(food.isFavourite ? `★ ${food.name} added to favourites` : `${food.name} removed from favourites`);
    });
  },
};

function header() {
  return html`
    <header class="view-header">
      <h1 class="view-title">My Foods</h1>
      <a class="btn btn--primary btn--pill" href="#/food/new">${icons.plus} New</a>
    </header>`;
}
