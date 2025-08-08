// app.js
const express = require('express');
const mongoose = require('mongoose');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Connect to MongoDB
// Use 127.0.0.1 to avoid IPv6 issues sometimes seen with "localhost"
mongoose.connect('mongodb://127.0.0.1:27017/todolistDB')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connect error:', err));

// Simple helper to produce the same "home title" everywhere
function getTodayString() {
  const today = new Date();
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  return today.toLocaleDateString('en-US', options);
}

// Normalize list names so "/work" and "/Work" point to same list
function normalizeListName(name) {
  if (!name) return name;
  const trimmed = String(name).trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

// Schemas and models
const itemSchema = new mongoose.Schema({ name: String });
const Item = mongoose.model('Item', itemSchema);

const listSchema = new mongoose.Schema({
  name: String,
  items: [itemSchema]
});
const List = mongoose.model('List', listSchema);

// Default items (plain objects OK for insertMany and embedding)
const defaultItems = [
  { name: 'Wake up' },
  { name: 'Brush teeth' },
  { name: 'Take a shower' }
];

/* ---------- Routes ---------- */

// Home page (default list)
app.get('/', async (req, res) => {
  try {
    const homeTitle = getTodayString();
    let items = await Item.find({});
    if (items.length === 0) {
      await Item.insertMany(defaultItems);
      items = await Item.find({});
    }
    res.render('list', { listTitle: homeTitle, items });
  } catch (err) {
    console.error('GET / error:', err);
    res.status(500).send('Server error');
  }
});

// Add new item to either home or a custom list
app.post('/', async (req, res) => {
  try {
    const itemName = req.body.newItem;
    const rawList = req.body.list;
    if (!itemName) return res.redirect('back');

    const homeTitle = getTodayString();

    if (rawList === homeTitle) {
      // Add to home collection
      await Item.create({ name: itemName });
      return res.redirect('/');
    } else {
      const listName = normalizeListName(rawList);
      let found = await List.findOne({ name: listName });
      if (!found) {
        // Create list with the item
        found = await List.create({ name: listName, items: [{ name: itemName }] });
      } else {
        found.items.push({ name: itemName });
        await found.save();
      }
      return res.redirect('/' + listName);
    }
  } catch (err) {
    console.error('POST / error:', err);
    res.status(500).send('Server error');
  }
});

// Delete item from home or custom list
app.post('/delete', async (req, res) => {
  try {
    const itemId = req.body.itemId;        // must be sent from form
    const rawList = req.body.list;         // must be sent from form
    if (!itemId) {
      console.warn('No itemId supplied to /delete');
      return res.redirect('/');
    }

    const homeTitle = getTodayString();

    if (rawList === homeTitle) {
      // delete from Item collection (home)
      await Item.findByIdAndDelete(itemId);
      return res.redirect('/');
    } else {
      const listName = normalizeListName(rawList);
      // remove subdocument by id using $pull
      await List.findOneAndUpdate(
        { name: listName },
        { $pull: { items: { _id: itemId } } }
      );
      return res.redirect('/' + listName);
    }
  } catch (err) {
    console.error('POST /delete error:', err);
    res.status(500).send('Server error');
  }
});

// Custom list route (e.g., /Work)
app.get('/:customListName', async (req, res) => {
  try {
    const customListName = normalizeListName(req.params.customListName);
    let list = await List.findOne({ name: customListName });
    if (!list) {
      // Create list with default items
      list = await List.create({ name: customListName, items: defaultItems });
    }
    res.render('list', { listTitle: customListName, items: list.items });
  } catch (err) {
    console.error('GET /:customListName error:', err);
    res.status(500).send('Server error');
  }
});

/* ---------- Start server ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
