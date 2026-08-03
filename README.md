# 🏈 Fantasy Draft Cheat Sheet 2026

A real-time draft companion web app for 10-team fantasy football leagues. Track your picks, get recommendations, monitor position scarcity, and never lose progress with autosave.

**Live & Ready for Draft Day** ✅

---

## 🎯 Quick Start

1. **Open the app**: Double-click `index.html` (no server needed)
2. **Configure your league** (optional):
   - Click the "Draft Position" widget
   - Set your league size, pick number, and round count
3. **Start drafting**:
   - Click a player row once (green) = you drafted them
   - Click again (gray) = someone else took them
   - Click again = clear the status
4. **Check your needs**: Click "My Team" button to see what you still need

That's it! Your draft is automatically saved to browser storage.

---

## 📁 File Structure

```
Fantasy-Draft-Cheat-Sheet-2026/
├── index.html          (~926 lines) - Main UI structure
├── script.js           (~950 lines) - All game logic
├── style.css           (~350 lines) - Styling & animations
└── README.md           (this file)
```

### Key Components

**index.html**
- 8 tier sections (S+ down to F) with 195 ranked players
- 3 side panels: My Team, Export/Import, Draft Summary
- Toolbar with search, position filters, and controls
- Tier navigation links
- Widgets: Draft Position, Recommended Pick, Best Available, Position Scarcity

**script.js**
- **State Management**: Track drafted players via CSS classes
- **Draft Cycle**: `toggleDraft(row)` is the main entry point
- **UI Updates**: Called after every draft action
- **Persistence**: localStorage autosave with 400ms debounce
- **Calculations**: Recommendations, scarcity alerts, value tracking

**style.css**
- Dark green football field theme
- Responsive design (mobile-first, breakpoints at 768px/600px)
- Smooth animations for buttons and hover states
- Color-coded position pills (RB=green, WR=blue, etc.)
- Sticky headers and panels for draft-day usability

---

## ✨ Current Features

### Core Functionality
- ✅ **3-State Draft Tracking**: Available → Your Pick (green) → Other's Pick (gray)
- ✅ **Auto-Draft Recommendations**: Top 3 picks tailored to your roster needs
- ✅ **Roster Needs Display**: Shows starters filled, bench slots filled per position
- ✅ **Position Scarcity Dashboard**: Real-time count of available players by position (color-coded urgency)
- ✅ **Tier-Cliff Visualization**: Visual breaks between tiers with colored bars and spacing
- ✅ **Scarcity Warnings**: Alerts when a tier is running out

### Quality-of-Life
- ✅ **Autosave**: Browser localStorage, optional toggle (on/off)
- ✅ **Search & Filters**: Find players by name, position, or team
- ✅ **Sorting**: Click column headers to sort within a tier
- ✅ **Export/Import**: Backup and restore your draft state
- ✅ **Best Available Now**: Top 5 available players at a glance
- ✅ **My Team Panel**: Full roster view with bye week warnings and value tracking
- ✅ **Draft Summary**: Final grade, position breakdown, value analysis
- ✅ **Rank Editing**: Reorder players within a tier or move across tiers
- ✅ **Rank Reset**: Restore original rankings anytime

### Customization
- **Bench Slots**: Configurable per position (defaults: QB:0, RB:2, WR:5, TE:0, K:0, DST:0)
- **League Settings**: Adjust team count, your pick #, and draft rounds
- **Search & Sort**: Instant filtering and sorting on the fly

---

## 🔧 Technical Architecture

### State Management
```javascript
// Draft state tracked via DOM classes on player rows
row.classList.add('drafted-mine');   // You took this player
row.classList.add('drafted-other');  // Someone else took them

// State calculations happen on every draft
function toggleDraft(row) {
  // 1. Update class
  // 2. Call updateXXX() functions
  // 3. Trigger autosave
}
```

### Update Flow
Every draft action triggers this sequence:
1. `toggleDraft(row)` — toggle class, trigger updates
2. `updateMyTeam()` — roster display & need highlighting
3. `updateRemaining()` — count drafted players
4. `updateBestAvailable()` — refresh top 5
5. `updatePickCounter()` — show next pick #
6. `updateScarcityAlerts()` — flag running-out positions
7. `updateRecommendedPick()` — suggest best pick for needs
8. `updateDraftDayDashboard()` — update position scarcity widget
9. `addRoundMarkers()` — show pick count
10. `scheduleSave()` — debounce localStorage write (400ms)

### Persistence (localStorage)
```javascript
// Auto-saves every 400ms while drafting
localStorage['draft-state-v1'] = JSON.stringify({
  tier: [...],        // Tier order (if manually reordered)
  drafted: [...],     // Drafted player rankings
  settings: {...}     // League size, pick #, rounds
});

// Restored on page load
function loadState() { ... }
```

### Responsive Design
- **Desktop (>768px)**: Full layout with side panels
- **Tablet (600-768px)**: Buttons wrap, panels stack
- **Mobile (<600px)**: Single column, touch-friendly spacing

---

## ⚙️ Configuration

### Bench Slots (Per Position)
Edit `script.js` line 31:
```javascript
var BENCH_SLOTS = {QB:0, RB:2, WR:5, TE:0, K:0, DST:0};
```

### League Settings (At Runtime)
Click "Draft Position" widget to set:
- Teams in league
- Your pick number
- Total rounds

### Customize Tier Names
Edit `script.js` lines 23-24:
```javascript
var TIER_IDS = ['Sp','S','A','B','C','D','E','F'];
var TIER_LABELS = {Sp:'S+', S:'S', A:'A', ...};
```

---

## 🚀 Known Limitations

### Current Issues
- ❌ **Keyboard shortcuts** attempted but caused click conflicts (needs refactor)
- ❌ **Deep waiver picks** (rank 141+) lack value data
- ❌ **Rank edits** don't update "RdX" round tags (intentional, complex to fix)
- ❌ **No keeper tracking** for dynasty/keeper leagues

### Browser Support
- ✅ Chrome, Firefox, Safari, Edge (all modern versions)
- ⚠️ localStorage required (will gracefully degrade without it)
- ⚠️ No offline mode (needs internet for initial page load, then works offline)

---

## 🎯 Future Enhancements

### High Priority (Easy wins)
- [ ] **Draft Timer** - Countdown for pick deadline (Visual timer + alert)
- [ ] **Turn Indicator** - Show whose turn it is (based on snake draft math)
- [ ] **Autopick Queue** - Mark favorites, auto-track when drafted
- [ ] **Keyboard Shortcuts** - Safely re-implement Ctrl+M/S/E

### Medium Priority (Nice to have)
- [ ] **Position Depth Chart** - Visual ranking 1-12 at each position
- [ ] **Mock Draft Mode** - Practice without saving
- [ ] **Trade Value Calculator** - Quick "who wins this trade" lookup
- [ ] **Injury Tracker** - Auto-update from web API

### Low Priority (Advanced)
- [ ] **Keeper Tracking** - Mark keeper-eligible players
- [ ] **Stack View** - Show QB + pass catchers combos
- [ ] **Browser Notifications** - Alert when teammate drafts
- [ ] **Dark Mode Toggle** - Alternative color scheme

---

## 🤖 For AI Assistants

### Code Organization
Search for these section markers in `script.js`:
- `// ==== POSITION FILTERING ====` - Search & filter logic
- `// ==== DRAFT DAY DASHBOARD ====` - Scarcity tracking
- `// ==== AUTOSAVE UTILITIES ====` - localStorage persistence
- `// ==== RECOMMENDATIONS ====` - Top-3 picks engine
- `// ==== MY TEAM PANEL ====` - Roster tracking

### Key Functions to Know
```javascript
toggleDraft(row)              // Main entry point for all draft actions
updateMyTeam()                // Refresh roster display
updateDraftDayDashboard()     // Refresh scarcity widget
updateRecommendedPick()       // Calculate top-3 recommendations
updateScarcityAlerts()        // Flag running-out positions
scheduleSave()                // Debounced localStorage write
loadState()                   // Restore from localStorage
```

### How to Help
1. **Understand the flow**: Read through `toggleDraft()` to see update sequence
2. **Test locally**: Just open `index.html` in a browser
3. **Use the console**: Open DevTools (F12) → Console for debugging
4. **Before making changes**: Check if updates need to be added to `toggleDraft()`

### Common Pitfalls
- ❌ Forgot to add new function to `toggleDraft()` update chain → UI doesn't refresh
- ❌ Forgot to add to both `toggleDraft()` AND `resetBoard()` → Partial updates
- ❌ Added event listeners too early → functions not yet defined
- ❌ Modified DOM during event (e.g., inside forEach) → inconsistent state

---

## 📊 Data Model

### Player Row Structure
```html
<tr class="draftrow" data-pos="RB" data-name="jahmyr gibbs" data-bye="6" 
    onclick="toggleDraft(this)">
  <td>1</td>                    <!-- Rank -->
  <td class="pname">...</td>    <!-- Player name + posrk badge -->
  <td><span class="pos-pill">RB</span></td>
  <td>DET ...</td>              <!-- Team + schedule strength -->
  <td>1</td>                    <!-- ADP -->
  <td class="valpos">+1</td>    <!-- Value vs ADP -->
  <td>6</td>                    <!-- Bye week -->
  <td class="hc">...</td>       <!-- Handcuff -->
  <td class="notecell">...</td> <!-- Notes -->
</tr>
```

### CSS Classes (State Tracking)
- `drafted-mine` — Green highlight, strikethrough, ✓ MINE badge
- `drafted-other` — Gray, 28% opacity
- `need-highlight` — Blue left border (position you still need)
- `hidden-row` — Display: none (filtered out)

---

## 🧪 Testing Checklist

Before publishing changes:

- [ ] Click player rows → toggle between 3 states
- [ ] Mark 5 players as "yours" → My Team panel updates
- [ ] Position Scarcity shows correct counts
- [ ] Autosave toggle button changes color (green/red)
- [ ] Refresh page → roster state restored
- [ ] Search and position filters work
- [ ] Reset button → clears all drafted status
- [ ] Export/Import → can backup and restore
- [ ] Mobile view (resize to <600px) → buttons wrap, readable

---

## 📝 Contributing

### To Request Features
1. **Describe the goal** - What problem does it solve?
2. **Provide context** - Is this for draft day speed? Accuracy? Learning?
3. **Link to code** - Point to relevant function or section

### To Report Bugs
1. **Steps to reproduce** - Exact sequence to trigger bug
2. **Expected behavior** - What should happen
3. **Actual behavior** - What actually happens
4. **Browser/device** - Chrome? Safari? Mobile?
5. **Console errors** - Open F12 and paste any red errors

---

## 📜 Version History

**v1.0** (Current)
- ✅ Core draft tracking with 3-state cycle
- ✅ Auto-draft recommendations
- ✅ Position Scarcity Dashboard
- ✅ Autosave to localStorage
- ✅ My Team panel with needs
- ✅ Export/Import backup
- ✅ Tier visualizations

**Planned Additions**
- Draft timer & turn indicator
- Keyboard shortcuts (safe implementation)
- Mock draft mode
- Trade calculator

---

## ⚖️ License

Free to use and modify for personal fantasy draft use.

---

## 🙋 Questions?

This cheat sheet is designed for self-service drafting. For questions about specific features, check the **For AI Assistants** section above or review the relevant function in `script.js`.

Good luck with your draft! 🏈
