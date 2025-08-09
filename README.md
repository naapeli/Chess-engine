# JavaScript Chess Engine

This project was my attempt to challenge a highly skilled friend at chess. Recognizing my limitations in chess skills, I aimed to leverage my coding knowledge to create an engine capable of evaluating many more positions than a human could. Despite the challenges, I gained invaluable experience and learned a lot during this project.

Play against the engine [here](https://naapeli.github.io/Chess-engine/). Make moves by dragging the pieces or clicking the piece first and the target square second. The UI shows which moves are possible. After making a move, the engine starts to think and eventually makes a move. One can adjust the time the engine is allowed to think from the UI.

## Key techniques implemented
### Move generation
- Self-made movegenerator that achieves around 370 kN/s (kilo nodes per second)
### Search algorithms:
- Negamax with iterative deepening and alpha-beta pruning
- Quiescence search with delta pruning
- Late-move-reductions and search extensions
- Aspiration windows
- Null-move pruning
- Principal variations search
- Razoring and deep razoring
- Futility- and reverse futility pruning
### Move ordering
- History heuristic for quiet move ordering
- Killer moves for move ordering
### Transposition table
- Transposition table with zobrist hashing to store already evaluated positions and remember positions for threefold repetition
### Evaluation function
- Material balance
- Piece positioning (different for middle and endgames)
- King safety with not castling penalty, pawn shield and king mobility
- Doubled, isolated and passed pawns
- Rook open file bonus

## Performance and insights
I estimate the bot's strength to be around 1400-1800 Elo. It excels at tactical recognition but is still developing in positional play. Currently, I often lose due to tactical oversights, and drawing is rare.

Initially, I intended to use this project to learn JavaScript while creating a fun project. However, I realized that using a language like C++, C# or Scala might have been more suitable for this type of project. Bit operations for move creation using unsigned 64-bit numbers could have significantly improved performance. Nonetheless, I’m satisfied with the learning outcomes and the competence of the engine I developed using JavaScript.

Later on, I decided to continue my journey in chess programming. This time I ended up using C++ from the beginning. One should go and check out the C++ chess engine in my repositories.
