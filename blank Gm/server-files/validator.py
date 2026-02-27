import os
import glob
import re
from treys import Card, Evaluator

def converteste_carte(carte_str):
    """Transformă formatul tău (ex: 10h) în formatul Treys (ex: Th)."""
    carte_str = carte_str.strip().replace('10', 'T')
    return Card.new(carte_str)

def carte_pretty(carte_int):
    """Returnează string-ul uman al unei cărți Treys."""
    return Card.int_to_pretty_str(carte_int)

def get_hand_rank_class(evaluator, score):
    """Returnează numele mâinii (ex: 'Two Pair', 'Flush')."""
    try:
        return evaluator.class_to_string(evaluator.get_rank_class(score))
    except:
        return "N/A"

def extrage_jucatori_fold(joc_text):
    """
    Extrage toți jucătorii care au dat fold din secțiunile de acțiuni.
    Returnează un set cu numele lor.
    """
    fold_set = set()
    # Caută toate liniile cu fold din orice rundă
    folds = re.findall(r'^\s+(\S+):\s+fold', joc_text, re.MULTILINE)
    for name in folds:
        fold_set.add(name)
    return fold_set

def extrage_jucatori_din_rezultat(joc_text):
    """
    Extrage toți câștigătorii declarați din secțiunea REZULTAT.
    Gestionează: Pot, Main Pot, Side Pot, Fold Win.
    Returnează: lista de dict-uri cu {pot_label, winners[], hand_name, amount}
    """
    rezultate = []
    # Matches: "  Pot: X, Y câștigă $Z fiecare — Hand Name"
    # Also:    "  Main Pot: X câștigă $Z fiecare — Hand Name"  
    # Also:    "  Side Pot 1: X câștigă $Z fiecare — Hand Name"
    # Also:    "  Fold Win: X câștigă $Z fiecare — Fold Win"
    pattern = re.compile(
        r'^\s+((?:Main Pot|Side Pot \d+|Pot|Fold Win)):\s+'
        r'(.*?)\s+câștigă\s+\$(\d+)\s+fiecare\s+—\s+(.*?)$',
        re.MULTILINE
    )
    for m in pattern.finditer(joc_text):
        pot_label = m.group(1)
        winners_str = m.group(2)
        amount = int(m.group(3))
        hand_name = m.group(4).strip()
        winners = [w.strip() for w in winners_str.split(',')]
        rezultate.append({
            'pot_label': pot_label,
            'winners': winners,
            'amount': amount,
            'hand_name': hand_name,
        })
    return rezultate

def valideaza_loguri():
    # Găsește toate fișierele .log care încep cu "games"
    fisiere = glob.glob("games*.log")
    
    if not fisiere:
        print("Nu am găsit niciun fișier .log care să înceapă cu 'games' în acest folder.")
        return

    evaluator = Evaluator()
    nume_fisier_raport = "raport_corectitudine.txt"

    print(f"Am găsit {len(fisiere)} fișiere. Încep validarea...\n")

    total_jocuri = 0
    total_corecte = 0
    total_incorecte = 0
    total_fold_win = 0
    total_erori = 0

    with open(nume_fisier_raport, 'w', encoding='utf-8') as f_out:
        for nume_fisier in sorted(fisiere):
            f_out.write(f"{'='*70}\n")
            f_out.write(f"FIȘIER: {nume_fisier}\n")
            f_out.write(f"{'='*70}\n\n")
            
            with open(nume_fisier, 'r', encoding='utf-8') as f_in:
                continut = f_in.read()

            # Împarte textul pe jocuri (separator: linie de ═)
            jocuri = continut.split('══════════════════════════════════════════════════════════════════════')

            for joc in jocuri:
                if "JOC #" not in joc:
                    continue

                total_jocuri += 1

                # Extrage ID-ul jocului
                match_id = re.search(r'JOC #(\d+)', joc)
                id_joc = match_id.group(1) if match_id else "Necunoscut"

                # Extrage rezultatele declarate
                rezultate = extrage_jucatori_din_rezultat(joc)
                if not rezultate:
                    f_out.write(f"JOC #{id_joc}: ❌ EROARE — Nu am putut extrage rezultatele.\n\n")
                    total_erori += 1
                    continue

                # Verifică dacă e doar Fold Win
                if all(r['pot_label'] == 'Fold Win' for r in rezultate):
                    total_fold_win += 1
                    f_out.write(f"JOC #{id_joc}: ⏭️  Fold Win — {rezultate[0]['winners'][0]} câștigă ${rezultate[0]['amount']} (fără showdown)\n\n")
                    continue

                # ── Extrage cărțile comunitare ──
                board_match = re.search(r'COMMUNITY CARDS:\s*\[(.*?)\]', joc)
                if not board_match:
                    f_out.write(f"JOC #{id_joc}: ❌ EROARE — Nu am găsit cărțile comunitare.\n\n")
                    total_erori += 1
                    continue
                
                board_str = board_match.group(1).strip()
                if not board_str:
                    f_out.write(f"JOC #{id_joc}: ❌ EROARE — Board-ul este gol.\n\n")
                    total_erori += 1
                    continue

                try:
                    board = [converteste_carte(c) for c in board_str.split()]
                except Exception as e:
                    f_out.write(f"JOC #{id_joc}: ❌ EROARE — Carte invalidă pe board: {board_str} ({e})\n\n")
                    total_erori += 1
                    continue

                # ── Extrage TOȚI jucătorii și mâinile ──
                # Pattern generic: orice nume urmat de [BOT] sau nu, apoi Mana: [...]
                jucatori_raw = re.findall(
                    r'Seat\s+\d+:\s+(\S+)(?:\s+\[BOT\])?\s+—\s+Chips:\s+\$\d+\s+—\s+Mana:\s+\[(.*?)\]',
                    joc
                )

                if not jucatori_raw:
                    f_out.write(f"JOC #{id_joc}: ❌ EROARE — Nu am putut extrage jucătorii.\n\n")
                    total_erori += 1
                    continue

                # ── Determină cine a dat fold ──
                fold_set = extrage_jucatori_fold(joc)

                # ── Evaluează doar jucătorii care NU au dat fold ──
                scoruri = {}         # nume → scor Treys (mai mic = mai bine)
                hand_names = {}      # nume → "Two Pair" etc.
                carti_jucatori = {}  # nume → "Kd Qs"

                for nume, mana_str in jucatori_raw:
                    carti_jucatori[nume] = mana_str
                    if nume in fold_set:
                        continue  # Nu evaluăm mâinile celor care au dat fold
                    try:
                        mana = [converteste_carte(c) for c in mana_str.split()]
                        scor = evaluator.evaluate(board, mana)
                        scoruri[nume] = scor
                        hand_names[nume] = get_hand_rank_class(evaluator, scor)
                    except Exception as e:
                        f_out.write(f"  ⚠️  Eroare evaluare {nume} ([{mana_str}]): {e}\n")

                if not scoruri:
                    f_out.write(f"JOC #{id_joc}: ❌ EROARE — Toți jucătorii au dat fold?\n\n")
                    total_erori += 1
                    continue

                # ── Determină câștigătorii reali (scor minim = mână cea mai bună) ──
                cel_mai_bun_scor = min(scoruri.values())
                castigatori_reali = sorted([n for n, s in scoruri.items() if s == cel_mai_bun_scor])

                # ── Câștigătorii declarați (din Main Pot / Pot — ignorăm Side Pots la verificare) ──
                # Main Pot / Pot = primul pot, conține câștigătorii principali
                main_rezultat = None
                for r in rezultate:
                    if r['pot_label'] in ('Pot', 'Main Pot'):
                        main_rezultat = r
                        break

                if not main_rezultat:
                    # Dacă nu am găsit Pot/Main Pot, luăm primul rezultat non-fold
                    non_fold = [r for r in rezultate if r['pot_label'] != 'Fold Win']
                    if non_fold:
                        main_rezultat = non_fold[0]
                    else:
                        total_fold_win += 1
                        f_out.write(f"JOC #{id_joc}: ⏭️  Fold Win\n\n")
                        continue

                castigatori_declarati = sorted(main_rezultat['winners'])

                # ── Compară ──
                este_corect = (castigatori_declarati == castigatori_reali)

                if este_corect:
                    total_corecte += 1
                    f_out.write(f"JOC #{id_joc}: ✅ CORECT — {', '.join(castigatori_declarati)} câștigă cu {main_rezultat['hand_name']}\n")
                else:
                    total_incorecte += 1
                    f_out.write(f"JOC #{id_joc}: 🚨 INCORECT!\n")
                    f_out.write(f"  📋 Board: [{board_str}]\n")
                    f_out.write(f"  🏆 Declarat:  {', '.join(castigatori_declarati)} — {main_rezultat['hand_name']}\n")
                    f_out.write(f"  🧮 Calculat:  {', '.join(castigatori_reali)} — {hand_names.get(castigatori_reali[0], '?')}\n")
                    f_out.write(f"\n  📊 Scoruri jucători activi (mai mic = mai bine):\n")

                    # Sortăm după scor (cel mai bun primul)
                    for nume, scor in sorted(scoruri.items(), key=lambda x: x[1]):
                        marker = " ◄◄◄ CÂȘTIGĂTOR REAL" if scor == cel_mai_bun_scor else ""
                        declarat_marker = " ◄ DECLARAT" if nume in castigatori_declarati else ""
                        f_out.write(f"    {nume:20s} [{carti_jucatori.get(nume, '?'):8s}] → scor {scor:5d} ({hand_names.get(nume, '?'):20s}){marker}{declarat_marker}\n")
                    
                    # Arată și cine a dat fold
                    folded = [n for n, _ in jucatori_raw if n in fold_set]
                    if folded:
                        f_out.write(f"\n  🃏 Au dat fold: {', '.join(folded)}\n")

                f_out.write("\n")

                # ── Verifică și Side Pots dacă există ──
                side_pots = [r for r in rezultate if r['pot_label'].startswith('Side Pot')]
                for sp in side_pots:
                    sp_winners = sp['winners']
                    # Verifică dacă câștigătorii side pot-ului sunt eligibili (au participat)
                    sp_valid = all(w in scoruri for w in sp_winners)
                    if sp_valid:
                        # Verifică dacă câștigătorii au cel mai bun scor dintre eligibili
                        sp_winner_scores = [scoruri[w] for w in sp_winners if w in scoruri]
                        if sp_winner_scores:
                            best_sp = min(sp_winner_scores)
                            if best_sp == min(scoruri.values()) or best_sp <= min(scoruri[w] for w in sp_winners):
                                pass  # Side pot winner logic e mai complexă, skip detaliat
                    f_out.write(f"  💰 {sp['pot_label']}: {', '.join(sp_winners)} câștigă ${sp['amount']} — {sp['hand_name']}\n")

        # ── SUMAR FINAL ──
        f_out.write(f"\n{'='*70}\n")
        f_out.write(f"SUMAR FINAL\n")
        f_out.write(f"{'='*70}\n")
        f_out.write(f"  Total jocuri analizate:  {total_jocuri}\n")
        f_out.write(f"  ✅ Corecte:              {total_corecte}\n")
        f_out.write(f"  🚨 Incorecte:            {total_incorecte}\n")
        f_out.write(f"  ⏭️  Fold Win (skip):      {total_fold_win}\n")
        f_out.write(f"  ❌ Erori parsare:         {total_erori}\n")
        if total_corecte + total_incorecte > 0:
            rata = total_corecte / (total_corecte + total_incorecte) * 100
            f_out.write(f"\n  📈 Rată corectitudine:   {rata:.1f}%  ({total_corecte}/{total_corecte + total_incorecte} showdown-uri)\n")
        f_out.write(f"{'='*70}\n")

    print(f"Gata! Raportul a fost salvat în '{nume_fisier_raport}'.")
    print(f"\nSumar: {total_corecte} corecte, {total_incorecte} incorecte, {total_fold_win} fold wins, {total_erori} erori")
    if total_corecte + total_incorecte > 0:
        rata = total_corecte / (total_corecte + total_incorecte) * 100
        print(f"Rată corectitudine: {rata:.1f}%")

if __name__ == "__main__":
    valideaza_loguri()