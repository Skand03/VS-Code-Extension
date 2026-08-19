# Quick Test Guide - 5 Minutes

## 🚀 Launch the Extension

```powershell
# 1. Compile (if not already done)
cd "c:\Users\Skand\OneDrive\Desktop\vs -etensions"
npm run compile

# 2. Press F5 in VS Code to launch Extension Development Host
```

---

## ✅ Test 1: Code Block with Green Copy Button (30 seconds)

1. Open `test-code-example.ts`
2. Select the `calculateFactorial` function (lines 10-18)
3. Right-click → **AI Assistant** → **Explain Code**
4. **Check:**
   - [ ] Code appears in a box with **2px border**
   - [ ] Code text is **bright green**
   - [ ] "📋 Copy" button is **green** (top-right of code box)
   - [ ] Hover over Copy button → it **lifts up**
   - [ ] Click Copy → changes to "✔ Copied!"
   - [ ] Paste (Ctrl+V) → exact code is copied

**Expected:**
```
┌─────────────────────────────────────┐
│ TYPESCRIPT            📋 Copy ← Green!
├─────────────────────────────────────┤
│ function calculateFactorial(n: number) {
│     if (n === 0 || n === 1) {  ← Green text
│         return 1;
│     }
│     return n * calculateFactorial(n - 1);
│ }
└─────────────────────────────────────┘
```

---

## ✅ Test 2: ChatGPT-Style Chat Layout (1 minute)

1. Select code in `test-code-example.ts`
2. Right-click → **AI Assistant** → **Chat Discussion**
3. Type: "explain this function"
4. Click **Send**
5. **Check:**
   - [ ] YOUR message appears on the **RIGHT** with **PURPLE** background
   - [ ] AI response appears on the **LEFT** with **GRAY** background
   - [ ] Messages have **rounded corners**
   - [ ] Timestamp shows at bottom of each message
   - [ ] New messages **slide in** smoothly

**Expected:**
```
                    ┌──────────────────────┐
                    │ explain this function│ ← Purple, right
                    │ 05:13               │
                    └──────────────────────┘

┌─────────────────────────────────────┐
│ This function calculates factorial...│ ← Gray, left
│ 05:13                               │
└─────────────────────────────────────┘
```

---

## ✅ Test 3: Light/Dark Mode (30 seconds)

1. Look at top-right of sidebar
2. Click **"☀️ Day"** button
3. **Check:**
   - [ ] Background turns **white**
   - [ ] Text becomes **dark gray** (readable!)
   - [ ] Code blocks become **light gray** with **dark green** text
   - [ ] Copy button still visible
   - [ ] Chat bubbles properly colored
   - [ ] Button text changes to **"🌙 Night"**
4. Click **"🌙 Night"** to go back to dark mode
5. **Check:**
   - [ ] Background turns **dark**
   - [ ] Text becomes **light gray**
   - [ ] Everything smoothly transitions

---

## ✅ Test 4: Responsive Design (30 seconds)

1. Grab VS Code sidebar edge
2. Drag to make it **very narrow** (minimum width)
3. **Check:**
   - [ ] Everything still visible and usable
   - [ ] Buttons may stack vertically (that's correct!)
   - [ ] Code blocks adapt to width
   - [ ] Chat bubbles shrink but stay readable
   - [ ] No horizontal overflow

---

## ✅ Test 5: Language Translation WITHOUT Code Changes (2 minutes)

1. Open sidebar language selector (top section)
2. Change from **"🇬🇧 English"** to **"🇮🇳 Hindi (हिन्दी)"**
3. Select code with variables/functions (e.g., `calculateFactorial`)
4. Right-click → **AI Assistant** → **Explain Code**
5. **Check:**
   - [ ] Explanation text is in **Hindi**
   - [ ] Code block shows **original English code**
   - [ ] NO Hindi comments inside code block
   - [ ] Variable names unchanged (`calculateFactorial`, not `गणनाFactorial`)
   - [ ] Function structure unchanged

6. Change language back to **"🇬🇧 English"**
7. Run **Explain Code** again
8. **Check:**
   - [ ] Explanation now in English
   - [ ] Code STILL has NO Hindi comments
   - [ ] Code exactly as originally written

**Expected (Hindi mode):**
```
यह फ़ंक्शन एक संख्या का फैक्टोरियल कैलकुलेट करता है...

┌─────────────────────────────────────┐
│ TYPESCRIPT            📋 Copy       │
├─────────────────────────────────────┤
│ function calculateFactorial(n: number) {  ← English!
│     if (n === 0 || n === 1) {            ← No Hindi!
│         return 1;
│     }
│     return n * calculateFactorial(n - 1);
│ }
└─────────────────────────────────────┘
```

---

## 🐛 If Something Doesn't Work

### Copy Button Not Working
**Symptom:** Clicking "📋 Copy" does nothing

**Check:**
1. Open DevTools (Help → Toggle Developer Tools)
2. Check Console for errors
3. Try clicking the code text itself
4. Verify `copyCodeBlock()` function exists in JS

### Messages Not Styled Like ChatGPT
**Symptom:** All messages same color

**Check:**
1. Verify chat mode is active (not Analyze Code mode)
2. Check `.chat-msg-user` has purple background
3. Check `.chat-msg-assistant` has gray background
4. Open DevTools → Elements → inspect message bubbles

### Light Mode Text Invisible
**Symptom:** Can't read text in light mode

**Fix:** Already implemented! If still happens:
1. Check `body.light` class is applied
2. Check CSS variables are defined for light mode
3. Open DevTools → Computed → verify colors

### Language Adds Comments Inside Code
**Symptom:** Code has Hindi/Bengali comments after language switch

**This should NOT happen anymore!** If it does:
1. Check `PromptService.ts` has updated language directive
2. Check `ChatService.ts` has updated system prompt
3. Recompile: `npm run compile`
4. Restart Extension Development Host (Ctrl+R)

---

## ✅ Success Criteria

If you see ALL of these, the implementation is perfect:

1. ✅ Code blocks have **bright green text** and **green Copy button**
2. ✅ User messages **right + purple**, AI messages **left + gray**
3. ✅ Light mode is **fully readable** with proper contrast
4. ✅ Works at **minimum sidebar width** (320px)
5. ✅ Language translation **doesn't touch code**, only explanations

---

## 📸 Take Screenshots!

**Please capture:**
1. Code block with green Copy button (dark mode)
2. Code block with green Copy button (light mode)
3. Chat conversation showing message layout
4. Sidebar at minimum width
5. Hindi explanation with English code

**Save to:** `screenshots/` folder for future reference

---

## 🎉 That's It!

**Total test time:** ~5 minutes

All features should work as described. If any issues, check the detailed guides:
- `UI-IMPROVEMENTS-SUMMARY.md` (technical details)
- `VISUAL-COMPARISON-GUIDE.md` (visual reference)
- `FIX-IMPLEMENTATION-SUMMARY.md` (original fixes)

**Enjoy your new ChatGPT-style AI Assistant!** 🚀
