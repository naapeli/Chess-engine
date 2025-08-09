class engine {
    constructor(board) {
        this.maxDepth = Number.MAX_SAFE_INTEGER;
        this.openingTheory = [];
        this.board = board;
        this.maxAllowedTime = 2000;

        this.searchStartTime;
        this.numberOfNodesSearchedPerIteration = 0;
        this.totalNumberOfNodesSearched = 0;
        this.searchCancelled = false;
        this.aspirationWindowFailed = false;
        this.bestMove;
        this.bestMoveEval;
        this.bestIterEvaluation = Number.MIN_SAFE_INTEGER;
        this.bestIterMove;
        this.moveOrdering = new moveOrderer();
        this.transpositionTable = new transpositionTable();
        this.R = 2; // null move pruning depth reduction constant
        this.materialMultiplier = 10;
        this.allowNullMovePruning = true;
        this.allowRazoring = true;
        this.allowDeepRazoring = true;
        this.allowReverseFutilityPruning = true;
        this.aspirationWindows = true;
        this.EXACT_NODE = 0;
        this.UPPERBOUND_NODE = 1;
        this.LOWERBOUND_NODE = 2;
        this.CHECKMATE_NODE = 3;
        this.CHECKMATE = 10000000;
        this.ALPABETA = 100000000;
        this.noHashEntry = Number.MAX_SAFE_INTEGER;
        this.futilityMargins = [0, this.materialMultiplier * pieceValues["P"],
                                this.materialMultiplier * pieceValues["B"],
                                this.materialMultiplier * pieceValues["R"]];

        this.pvLength = new Array(64)
        this.pvTable = Array.from({ length: 64 }, () => new Array(64));
        this.principalVariation = "";
    };

    // return the best move from current position from the opening book or iterative search
    getBestMove() {
        let gotMove = false;
        let move;
        if (moveLogArray.length < 30) {
            const startTime = performance.now();
            [gotMove, move] = this.getBookMove();
            if (gotMove) {
                console.log("Evaluation: book move");
                console.log("Move: ", move.convertToString());
                console.log("Time taken: " + (performance.now() - startTime));
                return move;
            };
        };
        // if position not in the opening book, return the move from iterative search
        return this.iterativeSearch();
    };

    iterativeSearch() {
        this.searchStartTime = performance.now();
        this.searchCancelled = false;
        this.bestIterEvaluation = Number.MIN_SAFE_INTEGER;
        this.totalNumberOfNodesSearched = 0;
        let alpha;
        let beta;
        let score;

        // clear historytable from previous search
        currentHistoryTable.clear();

        if (this.board.numberOfPossibleMoves == 0) {
            return;
        };
        console.log("Search running");
        const perspective = this.board.whiteToMove ? 1 : -1;
        for (let searchDepth = 1; searchDepth <= this.maxDepth; searchDepth++) {
            console.log("Iteration: " + searchDepth);
            for (let i = 0; i < aspirationWindows.length; i++) {
                if (score != undefined && this.aspirationWindows) {
                    const window = this.materialMultiplier * aspirationWindows[i];
                    alpha = score - window;
                    beta = score + window;
                } else {
                    alpha = -this.ALPABETA;
                    beta = this.ALPABETA;
                };
                // search the current position not allowing null-move-pruning at the first node
                score = this.search(searchDepth, 0, alpha, beta, perspective, 0, false, true);
                if (this.searchCancelled) { // if search cancelled, store bestIterMove as bestMove if evaluation is inside alpha and beta
                    if (!this.aspirationWindowFailed && alpha < score && score < beta) {
                        this.bestMove = this.bestIterMove;
                        this.bestMoveEval = this.bestIterEvaluation;
                        console.log("Evaluation of last iteration used")
                    };
                    this.totalNumberOfNodesSearched += this.numberOfNodesSearchedPerIteration;
                    console.log(this.principalVariation, this.bestMoveEval, this.numberOfNodesSearchedPerIteration);
                    console.log("Evaluation: " + perspective * this.bestMoveEval / (100 * this.materialMultiplier));
                    console.log("Principal variation: " + this.principalVariation);
                    console.log("Depth: " + searchDepth);
                    console.log("Time taken: " + Math.round(performance.now() - this.searchStartTime));
                    console.log("Nodes searched: " + this.totalNumberOfNodesSearched);
                    console.log("Positions in transposition table: " + this.transpositionTable.positionsInLookUp / parseInt(this.transpositionTable.size) * 100 + " %");
                    this.numberOfNodesSearchedPerIteration = 0;
                    this.principalVariation = this.principalVariation.split(" ").slice(2).join(" ");
                    return this.bestMove;
                } else if (alpha < score && score < beta) { // if score was inside alpha and beta
                    this.bestMove = this.bestIterMove;
                    this.bestMoveEval = this.bestIterEvaluation;
                    this.aspirationWindowFailed = false;
                    console.log(this.principalVariation, this.bestMoveEval, this.numberOfNodesSearchedPerIteration);
                    this.totalNumberOfNodesSearched += this.numberOfNodesSearchedPerIteration;
                    this.numberOfNodesSearchedPerIteration = 0;
                    if (this.bestMoveEval >= this.CHECKMATE - 20) {
                        const matePly = -this.bestMoveEval + this.CHECKMATE;
                        console.log("Found engine checkmate in " + Math.ceil(matePly / 2) + " (" + matePly + " ply).");
                        console.log("Principal variation: " + this.principalVariation);
                        console.log("Nodes searched: " + this.totalNumberOfNodesSearched);
                        return this.bestMove;
                    } else if (this.bestMoveEval <= -this.CHECKMATE + 20) {
                        const matePly = this.bestMoveEval + this.CHECKMATE;
                        console.log("Found player checkmate in " + Math.ceil(matePly / 2) + " (" + matePly + " ply).");
                        console.log("Principal variation: " + this.principalVariation);
                        console.log("Nodes searched: " + this.totalNumberOfNodesSearched);
                        return this.bestMove;
                    };
                    break;
                };
                // if we failed to find the score inside alpha and beta continue to the next aspiration window,
                // else continue to the next iteration
                console.log("Aspiration window failed!", this.numberOfNodesSearchedPerIteration);
                this.aspirationWindowFailed = true;
            };
        };
    };

    search(currentDepth, depthFromRoot, alpha, beta, colorPerspective, totalExtension, allowNullMovePruningAndRazoring, positionInCheck) {
        this.searchCancelled = (performance.now() - this.searchStartTime) > this.maxAllowedTime;
        if (this.searchCancelled) {
            return;
        };
        // increment node counter
        this.numberOfNodesSearchedPerIteration++;

        this.pvLength[depthFromRoot] = depthFromRoot;

        // look if position exists in the transposition table
        const position = this.transpositionTable.getEntryFromHash(this.board.zobristHash);

        // check for repetition
        if (this.isRepetition()) {
            if (depthFromRoot == 0) {
                this.bestIterEvaluation = 0;
                this.bestIterMove = position.bestMove;
                this.searchCancelled = true;
            };
            return 0;
        };
        
        // if position from transposition table allows getting the evaluation, return it
        if (position != undefined && position.zobristHash == this.board.zobristHash && Math.max(currentDepth, 0) <= position.depth) {
            if (position.nodeType == this.EXACT_NODE) {
                if (depthFromRoot == 0) {
                    this.bestIterEvaluation = position.evaluation;
                    this.bestIterMove = position.bestMove;
                };
                return position.evaluation;
            } else if (position.nodeType == this.LOWERBOUND_NODE) {
                alpha = Math.max(alpha, position.evaluation);
            } else if (position.nodeType == this.UPPERBOUND_NODE) {
                beta = Math.min(beta, position.evaluation);
            };
        };
        // if found a value for the position from transposition table, return it
        if (alpha >= beta) {
            return position.evaluation;
        };

        if (currentDepth <= 0) {
            // if end of depth, search captures to the end to reduce the horizon effect 
            const evaluation = this.quiescenceSearch(depthFromRoot, alpha, beta, false, colorPerspective);
            return evaluation;
        };

        // static evaluation for pruning purposes
        const staticEvaluation = this.evaluatePosition(colorPerspective);
        const notPvNode = beta == alpha + 1;
        if (!positionInCheck && notPvNode && currentDepth < 3 && this.notCheckMateScore(beta) && this.allowReverseFutilityPruning) {
            // reverse futility pruning if we are at the end of search at a non PV node and we do not have possibility for checkmate
            // prune node if we are winning so much that the opponent won't select this line
            let delta = this.materialMultiplier * pieceValues["P"] * currentDepth;
            if (staticEvaluation - delta >= beta) {
                return staticEvaluation - delta;
            };
        };

        // null-move pruning (give opponent extra move and search resulting position with reduced depth), and razoring
        if (allowNullMovePruningAndRazoring && !positionInCheck && notPvNode) {
            const pieceMaterialRemaining = colorPerspective == 1 ? this.board.getPieceMaterial("w") : this.board.getPieceMaterial("b");
            if (currentDepth >= 3 && staticEvaluation >= beta && pieceMaterialRemaining > 0 && this.allowNullMovePruning) {
                this.board.makeNullMove();
                const val = -this.search(currentDepth - 1 - this.R, depthFromRoot + 1, -beta, -beta + 1, -colorPerspective, false);
                this.board.undoNullMove();
                if (val >= beta) {
                    return beta;
                };
            };

            // razoring
            let nodeValue = staticEvaluation + this.materialMultiplier * pieceValues["P"];
            if (nodeValue < beta && this.allowRazoring) {
                if (currentDepth == 1) {
                    const newNodeValue = this.quiescenceSearch(depthFromRoot, alpha, beta, false, colorPerspective);
                    return Math.max(newNodeValue, nodeValue);
                };
                
                // deep razoring for nodes at depths 2 and 3
                if (this.allowDeepRazoring) {
                    nodeValue += this.materialMultiplier * pieceValues["P"];
                    if (nodeValue < beta && currentDepth <= 3) {
                        currentDepth -= 1;
                        //this implementation makes the engine worse at evaluating sacrifices but search a bit deeper??? (quiescence search takes surprisingly long in many positions)
                        //const newNodeValue = this.quiescenceSearch(depthFromRoot, alpha, beta, false, colorPerspective);
                        //if (newNodeValue < beta) {
                            //return newNodeValue;
                        //};
                    };
                };
            };
        };

        
        // extended futility pruning condition
        const futilityPruning = currentDepth < 4 && this.notCheckMateScore(alpha) && staticEvaluation + this.futilityMargins[currentDepth] <= alpha && notPvNode;

        // get and order all possible moves from current position
        const positionMoves = this.board.getPossibleMoves();
        const previousBestMove = (position != undefined && position.zobristHash == this.board.zobristHash) ? position.bestMove : undefined;
        const moves = this.moveOrdering.orderMoves(positionMoves, previousBestMove, depthFromRoot);
        let positionBestMove = moves[0];
        let PVNodeFound = 0;
        // starts from ALL-node and if we find a PV move, transforms into a PV node
        let nodeType = this.UPPERBOUND_NODE;

        // multi-cut
        /* disabled due to not testing the feature enough
        let highFails = 0;
        if (moves.length > 10 && notPvNode) {
            for (let i = 0; i < 7; i++) {
                const move = moves[i];
                this.board.makeMove(move);
                const inCheck = this.board.determineInCheck();
                this.incrementRepetition(move.movingPiece[1] == "P" || move.isCapture());

                // search position to 2 less depth to determine if position is a fail high node
                const val = -this.search(currentDepth - 3, depthFromRoot + 1, -(beta + 1), -beta, -colorPerspective, totalExtension, true, inCheck);
                if (val > beta) {
                    highFails++;
                };

                this.decrementRepetition();
                this.board.undoMove();
            };
        };
        // if position is an expected fail-high node, prune position
        if (highFails >= 3) {
            return beta;
        };*/

        // search through all moves and select the best one
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            this.board.makeMove(move);
            const inCheck = this.board.determineInCheck();

            // extended futility pruning
            if (futilityPruning && PVNodeFound && !move.isCapture() && !move.promotion && !inCheck) {
                this.board.undoMove();
                continue;
            };

            // update the amount of times a position has been seen in the search
            this.incrementRepetition(move.movingPiece[1] == "P" || move.isCapture());
            
            let currentEvaluation;
            // calculate search extension before PV logic
            const extension = this.getSearchExtension(move, totalExtension, inCheck);
            totalExtension += extension;
            // principal variations search
            if (PVNodeFound === 0) { // do a full search for the first move (previous best move)
                currentEvaluation = -this.search(currentDepth - 1 + extension, depthFromRoot + 1, -beta, -alpha, -colorPerspective, totalExtension, true, inCheck);
            } else {
                // calculate late move reduction after making the wanted move.
                const reduction = this.getSearchReduction(extension, move, i, currentDepth);

                // Do the principal variation search with reduced depth for other moves to try to prove that all other moves than
                // first PV node are bad. If this hypothesis turns out to be wrong, we need to spend more time to search the same nodes again
                // with searching the same position without late move reduction and a full window.
                if (reduction > 0) {
                    currentEvaluation = -this.search(currentDepth - 1 + extension - reduction, depthFromRoot + 1, -(alpha + 1), -alpha, -colorPerspective, totalExtension, true, inCheck);
                } else { // if we do not apply reduction to this move, make sure to do a full search
                    currentEvaluation = alpha + 1;
                };
                
                // if we got a better evaluation, need to do a full depth search
                if (currentEvaluation > alpha) {
                    // do still the principal variation search (null window)
                    currentEvaluation = -this.search(currentDepth - 1 + extension, depthFromRoot + 1, -(alpha + 1), -alpha, -colorPerspective, totalExtension, true, inCheck);
                    // if PV search fails to prove the position is bad, do the full search
                    if ((currentEvaluation > alpha) && (currentEvaluation < beta)) {
                        currentEvaluation = -this.search(currentDepth - 1 + extension, depthFromRoot + 1, -beta, -alpha, -colorPerspective, totalExtension, true, inCheck);
                    };
                };
            };
            
            // update the amount of times a position has been seen in the search
            this.decrementRepetition();
            
            this.board.undoMove();

            if (this.searchCancelled) {
                // if played the first move from previous iteration or more, store the best move even if the search cancelled,
                // not to waste the calculation time of the last iteration
                if (depthFromRoot == 0) {
                    return this.bestIterEvaluation;
                };
                return;
            };

            // alpha-beta pruning
            if (currentEvaluation >= beta) {
                // store best move as lower bound (since exiting search early)
                if (this.notCheckMateScore(beta)) {
                    this.transpositionTable.storeEvaluation(this.board.zobristHash, beta, currentDepth, this.LOWERBOUND_NODE, positionBestMove, depthFromRoot);
                } else {
                    // store checkmate for the bestmove but not evaluation
                    this.transpositionTable.storeEvaluation(this.board.zobristHash, 0, currentDepth, this.CHECKMATE_NODE, positionBestMove, depthFromRoot);
                };

                // update killer moves
                this.storeKillerMoves(move, depthFromRoot);
                
                if (depthFromRoot == 0) {
                    this.bestIterMove = positionBestMove;
                    this.bestIterEvaluation = beta;
                };
                return beta;
            };
            if (currentEvaluation > alpha) {
                alpha = currentEvaluation;
                positionBestMove = move;
                PVNodeFound++;
                nodeType = this.EXACT_NODE;

                // update the principal variation
                this.pvTable[depthFromRoot][depthFromRoot] = move.convertToString();
                for (let nextDepth = depthFromRoot + 1; nextDepth < this.pvLength[depthFromRoot + 1]; nextDepth++) {
                    this.pvTable[depthFromRoot][nextDepth] = this.pvTable[depthFromRoot + 1][nextDepth];
                };
                this.pvLength[depthFromRoot] = this.pvLength[depthFromRoot + 1];
            };
        };

        // singular extension if found 1 good move and we are at a PV node
        /* disabled due to not enough testing done
        if (!notPvNode && PVNodeFound === 1 && currentDepth > 3) {
            this.board.makeMove(positionBestMove);
            const inCheck = this.board.determineInCheck();
            this.incrementRepetition(positionBestMove.movingPiece[1] == "P" || positionBestMove.isCapture());
            const extension = this.getSearchExtension(positionBestMove, totalExtension, inCheck);

            alpha = -this.search(currentDepth - 1 + extension + 1, depthFromRoot + 1, -beta, -alpha, -colorPerspective, totalExtension, true, inCheck);

            this.decrementRepetition();
            this.board.undoMove();
        };*/

        // if found a terminal node, return the corresponding evaluation
        if (positionMoves.length === 0) {
            if (positionInCheck) {
                return -this.CHECKMATE + depthFromRoot; // checkmate
            };
            return 0; // stalemate
        };

        // store the best move into the history table (to help with move ordering)
        currentHistoryTable.add(positionBestMove, currentDepth * currentDepth);
        
        // store the evaluation of the position to the transposition table
        if (this.notCheckMateScore(alpha)) {
            this.transpositionTable.storeEvaluation(this.board.zobristHash, alpha, currentDepth, nodeType, positionBestMove, depthFromRoot);
        } else {
            // store checkmate for the bestmove but not evaluation
            this.transpositionTable.storeEvaluation(this.board.zobristHash, 0, currentDepth, this.CHECKMATE_NODE, positionBestMove, depthFromRoot);
        };

        // remember the best moves if the position is the original one, then return the evaluation
        if (depthFromRoot == 0) {
            this.bestIterMove = positionBestMove;
            this.bestIterEvaluation = alpha;
            this.principalVariation = this.getPrincipalVariation();
        };
        return alpha;
    };

    quiescenceSearch(depthFromRoot, alpha, beta, allowChecks, colorPerspective) {

        // increment node counter
        this.numberOfNodesSearchedPerIteration++;
        
        // check if evaluation of this position causes beta cutoff
        let stand_pat = this.evaluatePosition(colorPerspective);
        
        if (stand_pat >= beta) {
            return beta;
        };
        
        // delta pruning
        const BIG_DELTA = this.materialMultiplier * (1107); // this.materialMultiplier * (queen + pawn value)
        if ( stand_pat < alpha - BIG_DELTA ) {
            return alpha;
        };


        if (alpha < stand_pat) {
            alpha = stand_pat;
        };

        // determine possible moves
        const positionMoves = this.board.getPossibleMoves();
        const inCheck = this.board.inCheck();
        const moves = this.moveOrdering.orderMoves(positionMoves, undefined, depthFromRoot);
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            if (move.isCapture() || (inCheck && allowChecks)) { // continue search if move is piece capture
                this.board.makeMove(move);
                const score = -this.quiescenceSearch(depthFromRoot + 1, -beta, -alpha, allowChecks, -colorPerspective);
                this.board.undoMove();

                if (this.searchCancelled) {
                    return;
                };

                // alpha-beta pruning
                if (score >= beta) {
                    return beta;
                };
                if (score > alpha) {
                    alpha = score;
                };
            };
        };

        // if found a terminal node, return the corresponding evaluation
        if (positionMoves.length === 0) {
            if (inCheck) {
                return -this.CHECKMATE + 1000; // checkmate
            };
            return 0; // stalemate
        };

        return alpha;
    };

    // determines if a position is good for white (positive) or black (negative) and returns the evaluation
    // so that larger value is always good for current player given by colorPerspective
    evaluatePosition(colorPerspective) {
        let evaluation = 0;
        const endGameWeight = this.getEndGameWeight();

        // calculate material
        evaluation += this.materialMultiplier * (this.board.getMaterial("w") - this.board.getMaterial("b"));

        // evaluate different things based on the phase of the game
        if (endGameWeight == 0) { // early and middle game
            // calculate piece placement factor
            evaluation += (1 - endGameWeight) * (this.board.whitePiecePositionBonus - this.board.blackPiecePositionBonus);

            // calculate a penalty for king being far away from safe positions to encourage castling
            evaluation += 100 * (1 - Math.sqrt(endGameWeight)) * (this.getNotCastlingPenalty("b") - this.getNotCastlingPenalty("w"));

            // calculate pawnshield to discourage pushing pawns in front of the king too far
            evaluation += 200 * (1 - endGameWeight) * (this.getKingPawnShieldFactor("w") - this.getKingPawnShieldFactor("b"));

            // calculate king mobility factor in middlegames to encourage castling
            evaluation += 120 * (1 - endGameWeight) * (this.getKingSafetyFactor("w") - this.getKingSafetyFactor("b"));

            // calculate pawn and rook bonuses
            evaluation += (1 - endGameWeight) * (this.getCenterPawnBonus("w") - this.getCenterPawnBonus("b"));
            evaluation += (1 - endGameWeight) * (this.getOpenFileBonus("w") - this.getOpenFileBonus("b"));

        } else { // endgame
            // calculate piece placement factor
            evaluation += (endGameWeight) * (this.board.whitePiecePositionBonusEg - this.board.blackPiecePositionBonusEg);

            // calculate king position bonuses in winning endgames
            evaluation += endGameWeight * (this.getKingPositionEndGameFactor("w") - this.getKingPositionEndGameFactor("b"));
        };

        // calculate bonus for passed, doubled and isolated pawns
        evaluation += this.materialMultiplier / 11000 * (this.getPassedPawnBonus("w") - this.getPassedPawnBonus("b"));
        evaluation += (1 - endGameWeight) * (this.getDoubledAndIsolatedPawnPenalty("b") - this.getDoubledAndIsolatedPawnPenalty("w"));


        return colorPerspective * evaluation;
    };

    getEndGameWeight() {
        const whitePieceMaterial = this.board.getPieceMaterial("w");
        const blackPieceMaterial = this.board.getPieceMaterial("b");
        const endGameStart = 1100;
        const multiplier = 1 / endGameStart;
        if (this.board.whiteToMove) {
            return Math.sqrt(1 - Math.min(1, multiplier * blackPieceMaterial));
        } else {
            return Math.sqrt(1 - Math.min(1, multiplier * whitePieceMaterial));
        };
    };

    getKingSafetyFactor(owncolor) {
        const oppositeColor = owncolor == "w" ? "b" : "w";
        const ownKingLocation = owncolor == "w" ? this.board.getKingPosition("w") : this.board.getKingPosition("b");
        const oldIndex = this.board.numberOfPossibleMoves;
        this.board.getQueenMoves(ownKingLocation, oppositeColor);
        const amountOfQueenMoves = this.board.numberOfPossibleMoves - oldIndex;
        this.board.numberOfPossibleMoves = oldIndex;
        const ownKingMobilityFactor = Math.min(1 / amountOfQueenMoves, 1);
        return ownKingMobilityFactor;
    };

    getKingPawnShieldFactor(color) {
        const kingLocation = color == "w" ? this.board.getKingPosition("w") : this.board.getKingPosition("b");
        const kingIndex = this.board.boardUtility.squareToIndex(kingLocation);
        const kingShieldMask = color == "w" ? whiteKingPawnShield[kingIndex] : blackKingPawnShield[kingIndex];
        const pawnMask = this.board.pieceBitBoards[color + "P"];
        const shieldPawnMask = kingShieldMask & pawnMask;
        let ownPawnShieldCount = 0;
        if (shieldPawnMask != BigInt(0)) {
            for (let index = 0; index < 64; index++) {
                const isPawn = ((shieldPawnMask >> BigInt(index)) & 0x1n) != BigInt(0);
                if (isPawn) {
                    ownPawnShieldCount++;
                };
            };
        };
        return ownPawnShieldCount / 3;
    };

    getNotCastlingPenalty(owncolor) {
        const ownKingLocation = owncolor == "w" ? this.board.getKingPosition("w") : this.board.getKingPosition("b");
        const targetKingLocations = owncolor == "w" ? [[1, 7], [6, 7]] : [[1, 0], [6, 0]];
        const minL1NormFromTargets = Math.min(Math.abs(ownKingLocation[0] - targetKingLocations[0][0]) + Math.abs(ownKingLocation[1] - targetKingLocations[0][1]),
                                     Math.abs(ownKingLocation[0] - targetKingLocations[1][0]) + Math.abs(ownKingLocation[1] - targetKingLocations[1][1]));
        return Math.sqrt(minL1NormFromTargets);
    };

    getKingPositionEndGameFactor(color) {
        const myMaterial = color == "w" ? this.board.getMaterial("w") : this.board.getMaterial("b");
        const opponentMaterial = color == "b" ? this.board.getMaterial("w") : this.board.getMaterial("b");
        if (myMaterial >= opponentMaterial + 200) {
            const [iFriendly, jFriendly] = color == "w" ? this.board.getKingPosition("w") : this.board.getKingPosition("b");
            const [iEnemy, jEnemy] = color == "b" ? this.board.getKingPosition("w") : this.board.getKingPosition("b");
            const enemyDistFromCenter = Math.abs(iEnemy - 3.5) + Math.abs(jEnemy - 3.5);
            const L1DistBetweenKings = Math.abs(iEnemy - iFriendly) + Math.abs(jEnemy - jFriendly);
            return 5 * enemyDistFromCenter - 10 * L1DistBetweenKings;
        };
        return 0;
    };

    getCenterPawnBonus(color) {
        const pawnMask = this.board.pieceBitBoards[color + "P"];
        const centerMask = 0x0000003C3C000000n;
        const centerPawns = pawnMask & centerMask;
        let numberOfpawns = 0;
        if (centerPawns != BigInt(0)) {
            // first row
            for (let index = 26; index < 30; index++) {
                const isPawn = ((centerPawns >> BigInt(index)) & 0x1n) != BigInt(0);
                if (isPawn) {
                    numberOfpawns++;
                };
            };
            // second row
            for (let index = 34; index < 38; index++) {
                const isPawn = ((centerPawns >> BigInt(index)) & 0x1n) != BigInt(0);
                if (isPawn) {
                    numberOfpawns++;
                };
            };
        };
        return this.materialMultiplier * numberOfpawns * 20;
    };

    getPassedPawnBonus(color) {
        const pawnSquares = this.board.pieces[color + "P"];
        const enemyColor = color == "w" ? "b" : "w";
        const enemyPawnMask = this.board.pieceBitBoards[enemyColor + "P"];
        let bonus = 0;
        for (let index of pawnSquares) {
            const [i, j] = this.board.boardUtility.indexToSquare(index);
            const passedPawnMask = color == "w" ? whitePassedPawnMask[index] : blackPassedPawnMask[index];
            const isPassedPawn = (enemyPawnMask & passedPawnMask) == BigInt(0);
            if (isPassedPawn) {
                bonus += color == "w" ? ((7 - j) * 20) ** 3 : (20 * j) ** 3;
            };
        };
        return bonus;
    };

    getDoubledAndIsolatedPawnPenalty(color) {
        const pawnSquares = this.board.pieces[color + "P"];
        const pawnMask = this.board.pieceBitBoards[color + "P"];
        let penalty = 0;
        for (let index of pawnSquares) {
            const [i, j] = this.board.boardUtility.indexToSquare(index);
            const isIsolatedPawn = (pawnMask & isolatedPawnMask[i]) == BigInt(0);
            const isDoubledPawn = (pawnMask & doubledPawnMask[index]) != BigInt(0);
            if (isIsolatedPawn && isDoubledPawn) {
                penalty += this.materialMultiplier * 15;
            } else if (isIsolatedPawn) {
                penalty += this.materialMultiplier * 10;
            } else if (isDoubledPawn) {
                // penalty half of isolated pawns, since it will be counted twice
                penalty += this.materialMultiplier * 5;
            }
        };
        return penalty;
    };

    getOpenFileBonus(color) {
        const rookSquares = this.board.pieces[color + "R"];
        const pawnMask = this.board.pieceBitBoards[color + "P"];
        const kingLocation = color == "w" ? this.board.getKingPosition("b") : this.board.getKingPosition("w");
        const kingIndex = this.board.boardUtility.squareToIndex(kingLocation);
        let bonus = 0;
        for (let index of rookSquares) {
            const openFileMask = color == "w" ? whiteRookOpenFileMask[index] : blackRookOpenFileMask[index];
            const rookOnOpenFile = (openFileMask & pawnMask) == BigInt(0);
            const rookPointsAtKing = (tripleFile[index] & (0x1n << BigInt(kingIndex))) != BigInt(0);
            if (rookOnOpenFile && rookPointsAtKing) {
                bonus += this.materialMultiplier * 20;
            } else if (rookOnOpenFile) {
                bonus += this.materialMultiplier * 10;
            };
        };
        return bonus;
    };

    getSearchExtension(move, totalExtension, inCheck) {
        if (totalExtension > 16) {
            return 0;
        };
        let extension = 0;
        if (inCheck) { // check extension
            extension = 1;
        } else if (move.movingPiece[1] == "P" && (move.endPos[1] == 1 || move.endPos[1] == 6)) { // seventh rank pawn promotion extension
            extension = 1;
        } else if (this.board.numberOfPossibleMoves == 1) { // one reply extension
            extension = 1;
        }
        return extension;
    };

    getSearchReduction(extension, move, i, currentDepth) {
        let reduction = 0;
        // apply reduction, when move is not capture, doesn't cause extension (check, seventh rank pawn push, one reply), is not promotion, depth is at least 3
        // and it is not assumed to be in top 3 moves
        if (i < 4 || currentDepth < 3) {
            return reduction;
        };
        if (extension == 0 && !move.isCapture() && !move.promotion) {
            if (i > 10) {
                reduction = 2;
            } else if (i > 20) {
                reduction = 3;
            } else {
                reduction = 1;
            };
        };
        return reduction;
    };

    storeKillerMoves(move, depthFromRoot) {
        if (!move.isCapture()) {
            if (depthFromRoot < maxKillerMovePly) {
                killerMoves[1][depthFromRoot] = killerMoves[0][depthFromRoot];
                killerMoves[0][depthFromRoot] = move;
            };
        };
    };

    notCheckMateScore(evaluation) {
        return evaluation >= -this.CHECKMATE + 1000 && evaluation <= this.CHECKMATE - 1000;
    };

    // returns either [true, move] or [false]
    getBookMove() {
        const lines = [];
        const currentLine = moveLogArray.join(" ");

        if (moveLogArray.length == 0 && this.board.zobristHash == -4488746022743167406n) {
            // select first move
            let randomLine = openingBook[Math.floor(Math.random() * openingBook.length)];
            let firstMove = randomLine.split(" ")[0];
            return this.getMoveFromString(firstMove);
        } else {
            // go through all possible lines
            for (let line = 0; line < openingBook.length; line++) {
                if (openingBook[line].includes(currentLine) && openingBook[line].split(currentLine)[0] == "") {
                    lines.push(openingBook[line]);
                };
            };
        };
        
        // select one line from all possible lines
        if (lines.length) {
            const randomLine = lines[Math.floor(Math.random() * lines.length)];
            const bookMove = randomLine.split(currentLine)[1].split(" ")[1];
            return this.getMoveFromString(bookMove);
        }
        
        return [false];
    };

    isRepetition() {
        return repetitionTable[this.board.zobristHash] >= 2 || fiftyMoveCounter[fiftyMoveCounter.length - 1] > 99;
    };

    incrementRepetition(isCaptureOrPawnMove) {
        // three fold repetition
        if (repetitionTable[this.board.zobristHash] != 0 && repetitionTable[this.board.zobristHash] != undefined) {
            repetitionTable[this.board.zobristHash] += 1;
        } else {
            repetitionTable[this.board.zobristHash] = 1;
        };

        // fifty move rule
        if (isCaptureOrPawnMove) {
            fiftyMoveCounter.push(0);
        } else {
            fiftyMoveCounter.push(fiftyMoveCounter[fiftyMoveCounter.length - 1] + 1);
        };
    };

    decrementRepetition() {
        // three fold repetition
        repetitionTable[this.board.zobristHash] -= 1;

        // fifty move rule
        fiftyMoveCounter.pop();
    };

    getMoveFromString(move) {
        for (let i = 0; i < this.board.numberOfPossibleMoves; i++) {
            const currentMove = this.board.possibleMoves[i];
            if (currentMove.convertToString() == move) {
                    return [true, currentMove];
                };
        };
        return [false];
    };

    getPrincipalVariation() {
        let line = "";
        for (let i = 0; i < this.pvLength[0]; i++) {
            line += this.pvTable[0][i] + " ";
        };
        return line;
    };

    getNumberOfMoves(currentDepth) {
        let numberOfMoves = 0;
        if (currentDepth === 0) {
            return 1;
        };
        const originalMoves = this.board.getPossibleMoves();
        for (let move of originalMoves) {
            this.board.makeMove(move);
            numberOfMoves += this.getNumberOfMoves(currentDepth - 1);
            this.board.undoMove();
        };
        return numberOfMoves;
    };

    timeNumberOfMoves(depth) {
        const start = performance.now();
        const numberOfMoves = this.getNumberOfMoves(depth);
        console.log("Moves: ", numberOfMoves);
        console.log("Time taken: ", performance.now() - start);
    };

    debugNumberOfMoves(depth) {
        let total = 0
        const originalMoves = this.board.getPossibleMoves();
        for (let move of originalMoves) {
            let moveString = boardPositions[move.startPos[0]] + (8 - move.startPos[1]) + boardPositions[move.endPos[0]] + (8 - move.endPos[1]);
            this.board.makeMove(move);
            let moves = this.getNumberOfMoves(depth - 1);
            total += moves
            this.board.undoMove();
            console.log(moveString, moves)
        };
        console.log("Total", total)
    };

    unitTestMoves() {
        console.log("Tests started")
        const startTime1 = performance.now();
        const test1 = this.getNumberOfMoves(5) == 4865609;
        const endTime1 = performance.now();
        const elapsedTime1 = endTime1 - startTime1;
        console.log("Initial position up to depth 5 is " + test1);
        console.log(`Code execution time: ${elapsedTime1} milliseconds`);
        
        this.board.positionFromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -");
        const startTime2 = performance.now();
        const test2 = this.getNumberOfMoves(4) == 4085603;
        const endTime2 = performance.now();
        const elapsedTime2 = endTime2 - startTime2;
        console.log("Position 2 up to depth 4 is " + test2);
        console.log(`Code execution time: ${elapsedTime2} milliseconds`);

        this.board.positionFromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -");
        const startTime3 = performance.now();
        const test3 = this.getNumberOfMoves(6) == 11030083;
        const endTime3 = performance.now();
        const elapsedTime3 = endTime3 - startTime3;
        console.log("Position 3 up to depth 6 is " + test3);
        console.log(`Code execution time: ${elapsedTime3} milliseconds`);

        this.board.positionFromFen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1");
        const startTime4 = performance.now();
        const test4 = this.getNumberOfMoves(5) == 15833292;
        const endTime4 = performance.now();
        const elapsedTime4 = endTime4 - startTime4;
        console.log("Position 4 up to depth 5 is " + test4);
        console.log(`Code execution time: ${elapsedTime4} milliseconds`);

        this.board.positionFromFen("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8");
        const startTime5 = performance.now();
        const test5 = this.getNumberOfMoves(4) == 2103487;
        const endTime5 = performance.now();
        const elapsedTime5 = endTime5 - startTime5;
        console.log("Position 5 up to depth 4 is " + test5);
        console.log(`Code execution time: ${elapsedTime5} milliseconds`);

        this.board.positionFromFen("r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10");
        const startTime6 = performance.now();
        const test6 = this.getNumberOfMoves(4) == 3894594;
        const endTime6 = performance.now();
        const elapsedTime6 = endTime6 - startTime6;
        console.log("Position 6 up to depth 4 is " + test6);
        console.log(`Code execution time: ${elapsedTime6} milliseconds`);
        this.board.positionFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        console.log("Total time: ", performance.now() - startTime1);
    };
};

class moveOrderer {
    orderMoves(moves, previousBestMove, depthFromRoot) {
        this.calculateAssumedMoveScores(moves, previousBestMove, depthFromRoot);
        const sortedMoves = this.sort(moves);
        return sortedMoves;
    };

    calculateAssumedMoveScores(moves, previousBestMove, depthFromRoot) {
        for (let move of moves) {
            const movingPieceType = move.movingPiece[1];
            const takenPieceType = move.takenPiece[1];

            move.assumedMoveScore = 0;

            if (previousBestMove != undefined && move.equals(previousBestMove)) {
                move.assumedMoveScore += 1000000000;
            }; 

            if (takenPieceType != "-") {
                move.assumedMoveScore += 10000000 * (2 * pieceValues[takenPieceType] - pieceValues[movingPieceType]);
            };

            if (!move.isCapture()) {
                if (killerMoves[0][depthFromRoot] != undefined && move.equals(killerMoves[0][depthFromRoot])) {
                    move.assumedMoveScore += 1000001;
                } else if (killerMoves[1][depthFromRoot] != undefined && move.equals(killerMoves[1][depthFromRoot])) {
                    move.assumedMoveScore += 1000000;
                };
            };

            if (move.promotion) {
                move.assumedMoveScore += 100000 * pieceValues[move.promotedPiece[1]];
            };
            // order rest of the quiet moves based on the history of other positions
            move.assumedMoveScore += 100 * currentHistoryTable.get(move);
        };
    };

    sort(moves) {
        const sortedMoves = moves.sort((moveA, moveB) => {
            return moveB.assumedMoveScore - moveA.assumedMoveScore;
        });
        return sortedMoves;
    };
};