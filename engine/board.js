class board {
    constructor() {
        this.board = [
            ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
            ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
            ["--", "--", "--", "--", "--", "--", "--", "--"],
            ["--", "--", "--", "--", "--", "--", "--", "--"],
            ["--", "--", "--", "--", "--", "--", "--", "--"],
            ["--", "--", "--", "--", "--", "--", "--", "--"],
            ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
            ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"]
        ];
        this.pieces = { // piece-sets
            "wK": new Set([60]),
            "wQ": new Set([59]),
            "wR": new Set([56, 63]),
            "wB": new Set([58, 61]),
            "wN": new Set([57, 62]),
            "wP": new Set([48, 49, 50, 51, 52, 53, 54, 55]),
            "bK": new Set([4]),
            "bQ": new Set([3]),
            "bR": new Set([0, 7]),
            "bB": new Set([2, 5]),
            "bN": new Set([1, 6]),
            "bP": new Set([8, 9, 10, 11, 12, 13, 14, 15])
        };
        this.pieceBitBoards = { // bitBoards that will soon be used for passed pawn, isolated pawn and open file evaluation (and maybe even move generation)
            "wK": 0b0001000000000000000000000000000000000000000000000000000000000000n,
            "wQ": 0b0000100000000000000000000000000000000000000000000000000000000000n,
            "wR": 0b1000000100000000000000000000000000000000000000000000000000000000n,
            "wB": 0b0010010000000000000000000000000000000000000000000000000000000000n,
            "wN": 0b0100001000000000000000000000000000000000000000000000000000000000n,
            "wP": 0b0000000011111111000000000000000000000000000000000000000000000000n,
            "bK": 0b0000000000000000000000000000000000000000000000000000000000010000n,
            "bQ": 0b0000000000000000000000000000000000000000000000000000000000001000n,
            "bR": 0b0000000000000000000000000000000000000000000000000000000010000001n,
            "bB": 0b0000000000000000000000000000000000000000000000000000000000100100n,
            "bN": 0b0000000000000000000000000000000000000000000000000000000001000010n,
            "bP": 0b0000000000000000000000000000000000000000000000001111111100000000n
        };
        this.boardUtility = new boardUtils();
        this.ply = 0;
        this.whiteToMove = true
        this.whitePiecePositionBonus = this.boardUtility.countPiecePositionBonus(this.board)[0];
        this.blackPiecePositionBonus = this.boardUtility.countPiecePositionBonus(this.board)[1];
        this.whitePiecePositionBonusEg = this.boardUtility.countPiecePositionBonus(this.board)[2];
        this.blackPiecePositionBonusEg = this.boardUtility.countPiecePositionBonus(this.board)[3];
        this.whiteCanCastle = [true, true]; // long, short
        this.blackCanCastle = [true, true]; // long, short
        this.currentCheckingPieces = []; // element is in format [Set(possibleBlocks), ...]
        this.currentPinnedPieces = new Map(); // element is in format {location => directionIndex, ...}
        this.enPassant = [];
        this.numberOfPossibleMoves = 0;
        this.possibleMoves = new Array(218);
        this.getPossibleMoves();
        this.moveLog = []; // [[move, whiteCanCastle, blackCanCastle, enPassant], ...]
        this.zobristHash = this.boardUtility.generateZobristHash(this.board, this.enPassant, this.whiteCanCastle, this.blackCanCastle, this.whiteToMove);
        this.makeMoveTime = 0;
        this.undoMoveTime = 0;
        this.moveGenerationTime = 0;
        this.checkAndPinDetectionTime = 0;
        this.knightTime = 0;
        this.pawnTime = 0;
        this.bishopTime = 0;
        this.rookTime = 0;
        this.queenTime = 0;
        this.kingTime = 0;
    };

    makeMove(move) {
        const start = performance.now();
        this.zobristHash = this.boardUtility.updateZobristHashCastlingRights(this.zobristHash, this.whiteCanCastle, this.blackCanCastle);
        this.zobristHash = this.boardUtility.updateZobristHashEnPassant(this.zobristHash, this.enPassant);
        this.whiteToMove = !this.whiteToMove;
        let squaresToBeUpdated = [];
        let [i, j] = move.startPos;
        let [iNew, jNew] = move.endPos;
        this.ply++;
        this.moveLog.push([move, this.whiteCanCastle, this.blackCanCastle, this.enPassant]);

        this.makeKingCastleRights(move);
        this.makeEnPassantRights(move);

        const startIndex = this.boardUtility.squareToIndex(move.startPos);
        const endIndex = this.boardUtility.squareToIndex(move.endPos);
        this.pieces[move.movingPiece].delete(startIndex);
        this.pieceBitBoards[move.movingPiece] = this.pieceBitBoards[move.movingPiece] & ~(1n << BigInt(startIndex));
        if (!move.promotion) {
            this.pieces[move.movingPiece].add(endIndex);
            this.pieceBitBoards[move.movingPiece] = this.pieceBitBoards[move.movingPiece] | (1n << BigInt(endIndex));
        } else {
            this.pieces[move.promotedPiece].add(endIndex);
            this.pieceBitBoards[move.promotedPiece] = this.pieceBitBoards[move.promotedPiece] | (1n << BigInt(endIndex));
        };
        if (move.isCapture() && !move.enPassant) {
            this.pieces[move.takenPiece].delete(endIndex);
            this.pieceBitBoards[move.takenPiece] = this.pieceBitBoards[move.takenPiece] & ~(1n << BigInt(endIndex));
        };

        if (move.castleKing) {
            this.makeCastleMove(move).forEach(square => squaresToBeUpdated.push(square));
        } else if (move.promotion) {
            this.makePromotion(move);
        } else if (move.enPassant) {
            squaresToBeUpdated.push(this.makeEnPassant(move));
        } else {
            this.makeNormalMove(move);
        };

        if (move.movingPiece[1] == "P" || move.isCapture()) {
            fiftyMoveCounter.push(0);
        } else {
            fiftyMoveCounter.push(fiftyMoveCounter[fiftyMoveCounter.length - 1] + 1);
        };

        let [whitePiecePositionBonusDiff, blackPiecePositionBonusDiff, whitePiecePositionBonusDiffEg, blackPiecePositionBonusDiffEg] = this.boardUtility.getMaterialDiffs(move);
        this.whitePiecePositionBonus += whitePiecePositionBonusDiff;
        this.blackPiecePositionBonus += blackPiecePositionBonusDiff;
        this.whitePiecePositionBonusEg += whitePiecePositionBonusDiffEg;
        this.blackPiecePositionBonusEg += blackPiecePositionBonusDiffEg;
        squaresToBeUpdated.push([i, j], [iNew, jNew]);
        this.zobristHash = this.boardUtility.updateZobristHashCastlingRights(this.zobristHash, this.whiteCanCastle, this.blackCanCastle);
        this.zobristHash = this.boardUtility.updateZobristHashEnPassant(this.zobristHash, this.enPassant);
        this.zobristHash = this.boardUtility.updateZobristHash(this.zobristHash, move, !this.whiteToMove, this.enPassant);
        this.makeMoveTime += (performance.now() - start)
        return squaresToBeUpdated;
    };

    makeKingCastleRights(move) {
        if (move.movingPiece[1] == "K") {
            switch(move.movingPiece[0]) {
                case "w":
                    this.whiteCanCastle = [false, false]
                    break;
                case "b":
                    this.blackCanCastle = [false, false]
                    break;
            };
        };
    };

    makeEnPassantRights(move) {
        const [i, j] = move.startPos;
        const [iNew, jNew] = move.endPos;
        if (move.movingPiece[1] == "P" && Math.abs(jNew - j) == 2) {
            this.enPassant = move.endPos;
        } else {
            this.enPassant = [];
        };
    };

    makeCastleMove(move) {
        const squaresToBeUpdated = [];
        const [i, j] = move.startPos;
        const [iNew, jNew] = move.endPos;

        this.board[j][i] = "--";
        this.board[jNew][iNew] = move.movingPiece;

        if (iNew > i) {
            this.board[jNew][iNew - 1] = this.board[jNew][iNew + 1];
            this.board[jNew][iNew + 1] = "--";
            squaresToBeUpdated.push([iNew - 1, jNew], [iNew + 1, jNew]);

            if (move.movingPiece[0] == "w") {
                this.pieces["wR"].delete(63);
                this.pieces["wR"].add(61);
                this.pieceBitBoards["wR"] = this.pieceBitBoards["wR"] & ~(1n << BigInt(63));
                this.pieceBitBoards["wR"] = this.pieceBitBoards["wR"] | (1n << BigInt(61));
            } else {
                this.pieces["bR"].delete(7);
                this.pieces["bR"].add(5);
                this.pieceBitBoards["bR"] = this.pieceBitBoards["bR"] & ~(1n << BigInt(7));
                this.pieceBitBoards["bR"] = this.pieceBitBoards["bR"] | (1n << BigInt(5));
            };
        } else {
            this.board[jNew][iNew + 1] = this.board[jNew][iNew - 2];
            this.board[jNew][iNew - 2] = "--";
            squaresToBeUpdated.push([iNew - 2, jNew], [iNew + 1, jNew]);

            if (move.movingPiece[0] == "w") {
                this.pieces["wR"].delete(56);
                this.pieces["wR"].add(59);
                this.pieceBitBoards["wR"] = this.pieceBitBoards["wR"] & ~(1n << BigInt(56));
                this.pieceBitBoards["wR"] = this.pieceBitBoards["wR"] | (1n << BigInt(59));
            } else {
                this.pieces["bR"].delete(0);
                this.pieces["bR"].add(3);
                this.pieceBitBoards["bR"] = this.pieceBitBoards["bR"] & ~(1n << BigInt(0));
                this.pieceBitBoards["bR"] = this.pieceBitBoards["bR"] | (1n << BigInt(3));
            };
        };
        return squaresToBeUpdated;
    };

    makePromotion(move) {
        const [i, j] = move.startPos;
        const [iNew, jNew] = move.endPos;
        this.board[j][i] = "--";
        this.board[jNew][iNew] = move.promotedPiece;
    };

    makeEnPassant(move) {
        let squareToBeUpdated;
        const [i, j] = move.startPos;
        const [iNew, jNew] = move.endPos;
        this.board[j][i] = "--";
        this.board[jNew][iNew] = move.movingPiece;

        switch(move.movingPiece[0]) {
            case "w":
                this.board[jNew + 1][iNew] = "--";
                squareToBeUpdated = [iNew, jNew + 1];
                const indexB = this.boardUtility.squareToIndex([iNew, jNew + 1]);
                this.pieces["bP"].delete(indexB);
                this.pieceBitBoards["bP"] = this.pieceBitBoards["bP"] & ~(1n << BigInt(indexB));
                break;
            case "b":
                this.board[jNew - 1][iNew] = "--";
                squareToBeUpdated = [iNew, jNew - 1];
                const indexW = this.boardUtility.squareToIndex([iNew, jNew - 1]);
                this.pieces["wP"].delete(indexW);
                this.pieceBitBoards["wP"] = this.pieceBitBoards["wP"] & ~(1n << BigInt(indexW));
                break;
        };
        return squareToBeUpdated;
    };

    makeNormalMove(move) {
        const [i, j] = move.startPos;
        const [iNew, jNew] = move.endPos;
        this.board[j][i] = "--";
        this.board[jNew][iNew] = move.movingPiece;
        
        if (move.movingPiece[1] == "R") {
            switch(move.movingPiece[0]) {
                case "w":
                    this.whiteCanCastle = [this.whiteCanCastle[0] && this.board[7][0] == "wR", this.whiteCanCastle[1] && this.board[7][7] == "wR"];
                    break;
                case "b":
                    this.blackCanCastle = [this.blackCanCastle[0] && this.board[0][0] == "bR", this.blackCanCastle[1] && this.board[0][7] == "bR"];
                    break;
            };
        };
    };

    undoMove() {
        if (this.moveLog.length > 0) {
            const start = performance.now();
            this.zobristHash = this.boardUtility.updateZobristHashCastlingRights(this.zobristHash, this.whiteCanCastle, this.blackCanCastle);
            this.zobristHash = this.boardUtility.updateZobristHashEnPassant(this.zobristHash, this.enPassant);
            this.whiteToMove = !this.whiteToMove
            let squaresToBeUpdated = [];
            this.ply--;
            let [move, whiteCanCastle, blackCanCastle, possibleEnPassant] = this.moveLog.pop();
            this.board[move.startPos[1]][move.startPos[0]] = move.movingPiece;
            if (!move.enPassant) {
                this.board[move.endPos[1]][move.endPos[0]] = move.takenPiece;
            } else {
                this.board[move.endPos[1]][move.endPos[0]] = "--";
            };
            this.whiteCanCastle = whiteCanCastle;
            this.blackCanCastle = blackCanCastle;
            this.enPassant = possibleEnPassant;
            squaresToBeUpdated.push(move.startPos, move.endPos);

            const startIndex = this.boardUtility.squareToIndex(move.startPos);
            const endIndex = this.boardUtility.squareToIndex(move.endPos);
            this.pieces[move.movingPiece].add(startIndex);
            this.pieceBitBoards[move.movingPiece] = this.pieceBitBoards[move.movingPiece] | (1n << BigInt(startIndex));
            if (!move.promotion) {
                this.pieces[move.movingPiece].delete(endIndex);
                this.pieceBitBoards[move.movingPiece] = this.pieceBitBoards[move.movingPiece] & ~(1n << BigInt(endIndex));
            } else {
                this.pieces[move.promotedPiece].delete(endIndex);
                this.pieceBitBoards[move.promotedPiece] = this.pieceBitBoards[move.promotedPiece] & ~(1n << BigInt(endIndex));
            };
            if (move.isCapture() && !move.enPassant) {
                this.pieces[move.takenPiece].add(endIndex);
                this.pieceBitBoards[move.takenPiece] = this.pieceBitBoards[move.takenPiece] | (1n << BigInt(endIndex));
            };

            if (move.castleKing) {
                this.undoCastleMove(move).forEach(square => squaresToBeUpdated.push(square));
            } else if (move.enPassant) {
                squaresToBeUpdated.push(this.undoEnPassant(move));
            } else if (move.promotion) {
                if (this.whiteToMove) {
                    this.board[move.startPos[1]][move.startPos[0]] = "wP";
                } else {
                    this.board[move.startPos[1]][move.startPos[0]] = "bP";
                };
            };

            fiftyMoveCounter.pop();

            let [whitePiecePositionBonusDiff, blackPiecePositionBonusDiff, whitePiecePositionBonusDiffEg, blackPiecePositionBonusDiffEg] = this.boardUtility.getMaterialDiffs(move, true);
            this.whitePiecePositionBonus += whitePiecePositionBonusDiff;
            this.blackPiecePositionBonus += blackPiecePositionBonusDiff;
            this.whitePiecePositionBonusEg += whitePiecePositionBonusDiffEg;
            this.blackPiecePositionBonusEg += blackPiecePositionBonusDiffEg;
            this.zobristHash = this.boardUtility.updateZobristHashCastlingRights(this.zobristHash, this.whiteCanCastle, this.blackCanCastle);
            this.zobristHash = this.boardUtility.updateZobristHashEnPassant(this.zobristHash, this.enPassant);
            this.zobristHash = this.boardUtility.updateZobristHash(this.zobristHash, move, this.whiteToMove, this.enPassant);
            this.undoMoveTime += (performance.now() - start)
            return squaresToBeUpdated;
        };
        return [];
    };

    undoCastleMove(move) {
        const [iNew, jNew] = move.endPos;
        const squaresToBeUpdated = [];
        if (move.endPos[0] > move.startPos[0]) {
            this.board[jNew][iNew + 1] = this.board[jNew][iNew - 1];
            this.board[jNew][iNew - 1] = "--";
            squaresToBeUpdated.push([iNew + 1, jNew], [iNew - 1, jNew]);

            if (move.movingPiece[0] == "w") {
                this.pieces["wR"].add(63);
                this.pieces["wR"].delete(61);
                this.pieceBitBoards["wR"] = this.pieceBitBoards["wR"] & ~(1n << BigInt(61));
                this.pieceBitBoards["wR"] = this.pieceBitBoards["wR"] | (1n << BigInt(63));
            } else {
                this.pieces["bR"].add(7);
                this.pieces["bR"].delete(5);
                this.pieceBitBoards["bR"] = this.pieceBitBoards["bR"] & ~(1n << BigInt(5));
                this.pieceBitBoards["bR"] = this.pieceBitBoards["bR"] | (1n << BigInt(7));
            };
        } else {
            this.board[jNew][iNew - 2] = this.board[jNew][iNew + 1];
            this.board[jNew][iNew + 1] = "--";
            squaresToBeUpdated.push([iNew - 2, jNew], [iNew + 1, jNew]);

            if (move.movingPiece[0] == "w") {
                this.pieces["wR"].add(56);
                this.pieces["wR"].delete(59);
                this.pieceBitBoards["wR"] = this.pieceBitBoards["wR"] & ~(1n << BigInt(59));
                this.pieceBitBoards["wR"] = this.pieceBitBoards["wR"] | (1n << BigInt(56));
            } else {
                this.pieces["bR"].add(0);
                this.pieces["bR"].delete(3);
                this.pieceBitBoards["bR"] = this.pieceBitBoards["bR"] & ~(1n << BigInt(3));
                this.pieceBitBoards["bR"] = this.pieceBitBoards["bR"] | (1n << BigInt(0));
            };
        };
        return squaresToBeUpdated;
    };

    undoEnPassant(move) {
        const [iNew, jNew] = move.endPos;
        let squareToBeUpdated = [];
        switch(move.movingPiece) {
            case "wP":
                this.board[jNew + 1][iNew] = "bP";
                squareToBeUpdated = [iNew, jNew + 1];
                const indexB = this.boardUtility.squareToIndex([iNew, jNew + 1]);
                this.pieces["bP"].add(indexB);
                this.pieceBitBoards["bP"] = this.pieceBitBoards["bP"] | (1n << BigInt(indexB));
                return squareToBeUpdated;
            case "bP":
                this.board[jNew - 1][iNew] = "wP";
                squareToBeUpdated = [iNew, jNew - 1];
                const indexW = this.boardUtility.squareToIndex([iNew, jNew - 1]);
                this.pieces["wP"].add(indexW);
                this.pieceBitBoards["wP"] = this.pieceBitBoards["wP"] | (1n << BigInt(indexW));
                return squareToBeUpdated;
        };
    };

    determineChecksAndPins() {
        const start = performance.now()
        let kingPosition = this.whiteToMove ? this.getKingPosition("w") : this.getKingPosition("b");
        let color = this.whiteToMove ? "w" : "b";
        let oppositeColor = this.whiteToMove ? "b" : "w";
        let directions = [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 1], [0, -1], [-1, 0], [1, 0]];
        let pinnedPieceLocations = new Map();
        let checks = [];
        directions.forEach((direction, j) => {
            let checkBlockPositions = new Set();
            let i = 1;
            let xDiff = direction[0];
            let yDiff = direction[1];
            let directionPinned = []
            while (this.boardUtility.positionOnBoard(kingPosition[0] + i * xDiff, kingPosition[1] + i * yDiff)) {
                checkBlockPositions.add(10 * (kingPosition[0] + i * xDiff) + kingPosition[1] + i * yDiff)
                let currentPiece = this.board[kingPosition[1] + i * yDiff][kingPosition[0] + i * xDiff];
                if (currentPiece == "--") {
                    i++;
                    continue;
                } else if (currentPiece[0] == oppositeColor && directionPinned.length == 1) {
                    if (j < 4 && (currentPiece[1] == "B" || currentPiece[1] == "Q")) {
                        let [position, directionIndex] = directionPinned[0];
                        pinnedPieceLocations.set(10 * position[0] + position[1], directionIndex);
                        break;
                    } else if (4 <= j && (currentPiece[1] == "R" || currentPiece[1] == "Q")) {
                        let [position, directionIndex] = directionPinned[0];
                        pinnedPieceLocations.set(10 * position[0] + position[1], directionIndex);
                        break;
                    } else {
                        break;
                    };
                } else if (currentPiece[0] == color && directionPinned.length == 0) {
                    directionPinned.push([[kingPosition[0] + i * xDiff, kingPosition[1] + i * yDiff], j]);
                    i++;
                    continue;
                } else if (currentPiece[0] == oppositeColor && directionPinned.length == 0) {
                    if (j < 4 && (currentPiece[1] == "B" || currentPiece[1] == "Q")) {
                        checks.push(checkBlockPositions);
                        break;
                    } else if (4 <= j && (currentPiece[1] == "R" || currentPiece[1] == "Q")) {
                        checks.push(checkBlockPositions);
                        break;
                    } else {
                        break;
                    };
                } else {
                    break;
                };
            };
        });

        let knightMoves = [[-1, 2], [1, 2], [-1, -2], [1, -2], [-2, 1], [2, 1], [-2, -1], [2, -1]];
        knightMoves.forEach((moveDiff) => {
            if (this.boardUtility.positionOnBoard(kingPosition[0] + moveDiff[0], kingPosition[1] + moveDiff[1])) {
                let currentPiece = this.board[kingPosition[1] + moveDiff[1]][kingPosition[0] + moveDiff[0]];
                if (currentPiece[0] == oppositeColor && currentPiece[1] == "N") {
                    checks.push(new Set([10 * (kingPosition[0] + moveDiff[0]) + kingPosition[1] + moveDiff[1]]));
                };
            };
        });

        let i = kingPosition[0]
        let j = kingPosition[1]
        if (oppositeColor == "w") {
            if (this.boardUtility.positionOnBoard(i - 1, j + 1) && this.board[j + 1][i - 1] == "wP") {
                checks.push(new Set([10 * (i - 1) + j + 1]));
            } else if (this.boardUtility.positionOnBoard(i + 1, j + 1) && this.board[j + 1][i + 1] == "wP") {
                checks.push(new Set([10 * (i + 1) + j + 1]));
            };
        } else {
            if (this.boardUtility.positionOnBoard(i - 1, j - 1) && this.board[j - 1][i - 1] == "bP") {
                checks.push(new Set([10 * (i - 1) + j - 1]));
            } else if (this.boardUtility.positionOnBoard(i + 1, j - 1) && this.board[j - 1][i + 1] == "bP") {
                checks.push(new Set([10 * (i + 1) + j - 1]));
            };
        };
        this.currentCheckingPieces = checks;
        this.currentPinnedPieces = pinnedPieceLocations;
        this.checkAndPinDetectionTime += (performance.now() - start)
    };

    determineInCheck() {
        let kingPosition = this.whiteToMove ? this.getKingPosition("w") : this.getKingPosition("b");
        let color = this.whiteToMove ? "w" : "b";
        let oppositeColor = this.whiteToMove ? "b" : "w";
        let directions = [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 1], [0, -1], [-1, 0], [1, 0]];
        for (let j = 0; j < directions.length; j++) {
            const direction = directions[j];
            let i = 1;
            let xDiff = direction[0];
            let yDiff = direction[1];
            while (this.boardUtility.positionOnBoard(kingPosition[0] + i * xDiff, kingPosition[1] + i * yDiff)) {
                let currentPiece = this.board[kingPosition[1] + i * yDiff][kingPosition[0] + i * xDiff];
                if (currentPiece == "--") {
                    i++;
                    continue;
                } else if (currentPiece[0] == color) {
                    break;
                } else {
                    if (j < 4 && (currentPiece[1] == "B" || currentPiece[1] == "Q")) {
                        return true;
                    } else if (4 <= j && (currentPiece[1] == "R" || currentPiece[1] == "Q")) {
                        return true;
                    } else {
                        break;
                    };
                };
            };
        };

        let knightMoves = [[-1, 2], [1, 2], [-1, -2], [1, -2], [-2, 1], [2, 1], [-2, -1], [2, -1]];
        for (let moveDiff of knightMoves) {
            if (this.boardUtility.positionOnBoard(kingPosition[0] + moveDiff[0], kingPosition[1] + moveDiff[1])) {
                let currentPiece = this.board[kingPosition[1] + moveDiff[1]][kingPosition[0] + moveDiff[0]];
                if (currentPiece[0] == oppositeColor && currentPiece[1] == "N") {
                    return true;
                };
            };
        };

        let i = kingPosition[0]
        let j = kingPosition[1]
        if (oppositeColor == "w") {
            if (this.boardUtility.positionOnBoard(i - 1, j + 1) && this.board[j + 1][i - 1] == "wP") {
                return true;
            } else if (this.boardUtility.positionOnBoard(i + 1, j + 1) && this.board[j + 1][i + 1] == "wP") {
                return true;
            };
        } else {
            if (this.boardUtility.positionOnBoard(i - 1, j - 1) && this.board[j - 1][i - 1] == "bP") {
                return true;
            } else if (this.boardUtility.positionOnBoard(i + 1, j - 1) && this.board[j - 1][i + 1] == "bP") {
                return true;
            };
        };
        return false;
    };

    getPossibleMoves() {
        this.determineChecksAndPins();
        const start = performance.now()
        this.numberOfPossibleMoves = 0;
        for (let key in this.pieces) {
            const pieceSet = this.pieces[key];
            for (let index of pieceSet) {
                const square = this.boardUtility.indexToSquare(index);
                this.getPossibleMovesSquare(square);
            };
        };
        this.moveGenerationTime += (performance.now() - start)
        return this.possibleMoves.slice(0, this.numberOfPossibleMoves);
    };

    getPossibleMovesSquare(pos) {
        const start = performance.now()
        const [i, j] = pos;
        var currentPiece = this.board[j][i];
        let color = this.whiteToMove ? "w" : "b";
        let oppositeColor = this.whiteToMove ? "b" : "w";
        if (currentPiece[0] == color) {
            switch(currentPiece[1]) {
                case "P":
                    this.getPawnMoves(pos, color, oppositeColor);
                    this.pawnTime += (performance.now() - start)
                    break;
                case "N":
                    this.getKnightMoves(pos, color);
                    this.knightTime += (performance.now() - start)
                    break;
                case "B":
                    this.getBishopMoves(pos, oppositeColor);
                    this.bishopTime += (performance.now() - start)
                    break;
                case "R":
                    this.getRookMoves(pos, oppositeColor);
                    this.rookTime += (performance.now() - start)
                    break;
                case "Q":
                    this.getQueenMoves(pos, oppositeColor);
                    this.queenTime += (performance.now() - start)
                    break;
                case "K":
                    this.getKingMoves(pos, color);
                    this.kingTime += (performance.now() - start)
                    break;
            };
        };
    };

    getPawnMoves(pieceLocation, color, oppositeColor) {
        let [i, j] = pieceLocation;
        let [inPinnedPieces, direction] = this.boardUtility.pieceInPinnedPieces(i, j, this.currentPinnedPieces);
        let advancePossible = !inPinnedPieces || (direction[0] == 0 && (direction[1] == -1 || direction[1] == 1));
        let rightTakePossible = !inPinnedPieces || (direction[0] == -1 && direction[1] == -1) || (direction[0] == 1 && direction[1] == 1);
        let leftTakePossible = !inPinnedPieces || (direction[0] == 1 && direction[1] == -1) || (direction[0] == -1 && direction[1] == 1);
        let doubleCheck = this.currentCheckingPieces.length >= 2;
        let noCheck = this.currentCheckingPieces.length == 0;
        let blockLocations;
        if (!noCheck) {
            blockLocations = this.currentCheckingPieces[0];
        };
        if (doubleCheck) {
            return;
        };
        if (color == "w") {
            if (j - 1 >= 0 && this.board[j - 1][i] == "--" && advancePossible) {
                if (noCheck || blockLocations.has(10 * i + j - 1)) {
                    if (j - 1 != 0) {
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i, j - 1], "wP", "--");
                        this.numberOfPossibleMoves++;
                    } else {
                        const possiblePromotions = ["wN", "wB", "wR", "wQ"];
                        possiblePromotions.forEach((piece) => {
                            this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i, j - 1], "wP", "--", true, false, false, piece);
                            this.numberOfPossibleMoves++;
                        });
                    };
                };
                if (j == 6 && this.board[4][i] == "--" && (noCheck || blockLocations.has(10 * i + j - 2))) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i, j - 2], "wP", "--");
                    this.numberOfPossibleMoves++;
                };
            };
            if (j - 1 >= 0 && i - 1 >= 0 && this.board[j - 1][i - 1][0] == "b" && rightTakePossible && (noCheck || blockLocations.has(10 * (i - 1) + j - 1))) {
                if (j - 1 != 0) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i - 1, j - 1], "wP", this.board[j - 1][i - 1]);
                    this.numberOfPossibleMoves++;
                } else {
                    const possiblePromotions = ["wN", "wB", "wR", "wQ"];
                    possiblePromotions.forEach((piece) => {
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i - 1, j - 1], "wP", this.board[j - 1][i - 1], true, false, false, piece);
                        this.numberOfPossibleMoves++;
                    });
                };
            };
            if (j - 1 >= 0 && i + 1 < 8 && this.board[j - 1][i + 1][0] == "b" && leftTakePossible && (noCheck || blockLocations.has(10 * (i + 1) + j - 1))) {
                if (j - 1 != 0) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i + 1, j - 1], "wP", this.board[j - 1][i + 1]);
                    this.numberOfPossibleMoves++;
                } else {
                    const possiblePromotions = ["wN", "wB", "wR", "wQ"];
                    possiblePromotions.forEach((piece) => {
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i + 1, j - 1], "wP", this.board[j - 1][i + 1], true, false, false, piece);
                        this.numberOfPossibleMoves++;
                    });
                };
            };
            if (this.enPassant.length > 0 && j == 3) {
                if (this.enPassant[1] == 3 && this.enPassant[0] == i - 1 && 0 <= i - 1 && this.boardUtility.enPassantPin([i, j], [i - 1, j], color, oppositeColor, this.getKingPosition("w"), this.board) && rightTakePossible && (noCheck || blockLocations.has(10 * (i - 1) + j))) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i - 1, j - 1], "wP", "--", false, false, true);
                    this.numberOfPossibleMoves++;
                };
                if (this.enPassant[1] == 3 && this.enPassant[0] == i + 1 && i + 1 < 8 && this.boardUtility.enPassantPin([i, j], [i + 1, j], color, oppositeColor, this.getKingPosition("w"), this.board) && leftTakePossible && (noCheck || blockLocations.has(10 * (i + 1) + j))) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i + 1, j - 1], "wP", "--", false, false, true);
                    this.numberOfPossibleMoves++;
                };
            };
        } else {
            if (j + 1 < 8 && this.board[j + 1][i] == "--" && advancePossible) {
                if (noCheck || blockLocations.has(10 * i + j + 1)) {
                    if (j + 1 != 7) {
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i, j + 1], "bP", "--");
                        this.numberOfPossibleMoves++;
                    } else {
                        const possiblePromotions = ["bN", "bB", "bR", "bQ"];
                        possiblePromotions.forEach((piece) => {
                            this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i, j + 1], "bP", "--", true, false, false, piece);
                            this.numberOfPossibleMoves++;
                        });
                    };
                };
                if (j == 1 && this.board[3][i] == "--" && (noCheck || blockLocations.has(10 * i + j + 2))) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i, j + 2], "bP", "--");
                    this.numberOfPossibleMoves++;
                };
            };
            if (j + 1 < 8 && i - 1 >= 0 && this.board[j + 1][i - 1][0] == "w" && leftTakePossible && (noCheck || blockLocations.has(10 * (i - 1) + j + 1))) {
                if (j + 1 != 7) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i - 1, j + 1], "bP", this.board[j + 1][i - 1]);
                    this.numberOfPossibleMoves++;
                } else {
                    const possiblePromotions = ["bN", "bB", "bR", "bQ"];
                    possiblePromotions.forEach((piece) => {
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i - 1, j + 1], "bP", this.board[j + 1][i - 1], true, false, false, piece);
                        this.numberOfPossibleMoves++;
                    });
                };
            };
            if (j + 1 < 8 && i + 1 < 8 && this.board[j + 1][i + 1][0] == "w" && rightTakePossible && (noCheck || blockLocations.has(10 * (i + 1) + j + 1))) {
                if (j + 1 != 7) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i + 1, j + 1], "bP", this.board[j + 1][i + 1]);
                    this.numberOfPossibleMoves++;
                } else {
                    const possiblePromotions = ["bN", "bB", "bR", "bQ"];
                    possiblePromotions.forEach((piece) => {
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i + 1, j + 1], "bP", this.board[j + 1][i + 1], true, false, false, piece);
                        this.numberOfPossibleMoves++;
                    });
                };
            };
            if (this.enPassant.length > 0 && j == 4) {
                if (this.enPassant[1] == 4 && this.enPassant[0] == i - 1 && 0 <= i - 1 && this.boardUtility.enPassantPin([i, j], [i - 1, j], color, oppositeColor, this.getKingPosition("b"), this.board) && leftTakePossible && (noCheck || blockLocations.has(10 * (i - 1) + j))) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i - 1, j + 1], "bP", "--", false, false, true);
                    this.numberOfPossibleMoves++;
                };
                if (this.enPassant[1] == 4 && this.enPassant[0] == i + 1 && i + 1 < 8 && this.boardUtility.enPassantPin([i, j], [i + 1, j], color, oppositeColor, this.getKingPosition("b"), this.board) && rightTakePossible && (noCheck || blockLocations.has(10 * (i + 1) + j))) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [i + 1, j + 1], "bP", "--", false, false, true);
                    this.numberOfPossibleMoves++;
                };
            };
        };
    };

    getKnightMoves(pieceLocation, color) {
        let moveDifferences = [[-1, 2], [1, 2], [-1, -2], [1, -2], [-2, 1], [2, 1], [-2, -1], [2, -1]];
        let [i, j] = pieceLocation;
        let [inPinnedPieces, _] = this.boardUtility.pieceInPinnedPieces(i, j, this.currentPinnedPieces);
        let doubleCheck = this.currentCheckingPieces.length >= 2;
        let noCheck = this.currentCheckingPieces.length == 0;
        let blockLocations;
        const movingPiece = this.board[j][i];
        if (!noCheck) {
            blockLocations = this.currentCheckingPieces[0];
        };
        if (doubleCheck || inPinnedPieces) {
            return;
        };
        moveDifferences.forEach((xyDiff) => {
            let iNew = i + xyDiff[0]
            let jNew = j + xyDiff[1]
            if (this.boardUtility.positionOnBoard(iNew, jNew) && this.board[jNew][iNew][0] != color && (noCheck || blockLocations.has(10 * iNew + jNew))) {
                this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [iNew, jNew], movingPiece, this.board[jNew][iNew]);
                this.numberOfPossibleMoves++;
            };
        });
    };

    getBishopMoves(pieceLocation, oppositeColor) {
        let directions = [[-1, 1], [1, -1], [-1, -1], [1, 1]]
        let [i, j] = pieceLocation;
        let [inPinnedPieces, pinDirection] = this.boardUtility.pieceInPinnedPieces(i, j, this.currentPinnedPieces);
        let doubleCheck = this.currentCheckingPieces.length >= 2;
        let noCheck = this.currentCheckingPieces.length == 0;
        let blockLocations;
        const movingPiece = this.board[j][i];
        if (!noCheck) {
            blockLocations = this.currentCheckingPieces[0];
        };
        if (doubleCheck) {
            return;
        };
        directions.forEach(direction => {
            let n = 1;
            let directionPossible = !inPinnedPieces || (pinDirection[0] == direction[0] && pinDirection[1] == direction[1]) || (-pinDirection[0] == direction[0] && -pinDirection[1] == direction[1]);
            if (directionPossible) {
                while (this.boardUtility.positionOnBoard(i + n * direction[0], j + n * direction[1])) {
                    let iNew = i + n * direction[0];
                    let jNew = j + n * direction[1];
                    let currentPiece = this.board[jNew][iNew];
                    if (currentPiece == "--") {
                        if (noCheck || blockLocations.has(10 * iNew + jNew)) {
                            this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [iNew, jNew], movingPiece, currentPiece);
                            this.numberOfPossibleMoves++;
                        };
                        n++;
                        continue;
                    } else if (currentPiece[0] == oppositeColor && (noCheck || blockLocations.has(10 * iNew + jNew))) {
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [iNew, jNew], movingPiece, currentPiece);
                        this.numberOfPossibleMoves++;
                        break;
                    };
                    break;
                };
            };
        });
    };

    getRookMoves(pieceLocation, oppositeColor) {
        let directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]
        let [i, j] = pieceLocation;
        let [inPinnedPieces, pinDirection] = this.boardUtility.pieceInPinnedPieces(i, j, this.currentPinnedPieces);
        let doubleCheck = this.currentCheckingPieces.length >= 2;
        let noCheck = this.currentCheckingPieces.length == 0;
        let blockLocations;
        const movingPiece = this.board[j][i];
        if (!noCheck) {
            blockLocations = this.currentCheckingPieces[0];
        };
        if (doubleCheck) {
            return;
        };
        directions.forEach(direction => {
            let n = 1;
            let directionPossible = !inPinnedPieces || (pinDirection[0] == direction[0] && pinDirection[1] == direction[1]) || (-pinDirection[0] == direction[0] && -pinDirection[1] == direction[1]);
            if (directionPossible) {
                while (this.boardUtility.positionOnBoard(i + n * direction[0], j + n * direction[1])) {
                    let iNew = i + n * direction[0];
                    let jNew = j + n * direction[1];
                    let currentPiece = this.board[jNew][iNew];
                    if (currentPiece == "--") {
                        if (noCheck || blockLocations.has(10 * iNew + jNew)) {
                            this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [iNew, jNew], movingPiece, currentPiece);
                            this.numberOfPossibleMoves++;
                        };
                        n++;
                        continue;
                    } else if (currentPiece[0] == oppositeColor && (noCheck || blockLocations.has(10 * iNew + jNew))) {
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [iNew, jNew], movingPiece, currentPiece);
                        this.numberOfPossibleMoves++;
                        break;
                    };
                    break;
                };
            };
        });
    };

    getQueenMoves(pieceLocation, oppositeColor) {
        this.getBishopMoves(pieceLocation, oppositeColor);
        this.getRookMoves(pieceLocation, oppositeColor);
    };

    getKingMoves(pieceLocation, color) {
        let directions = [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 1], [0, -1], [-1, 0], [1, 0]];
        let [i, j] = pieceLocation;
        let oppositeColor = color == "w" ? "b" : "w";
        const movingPiece = this.board[j][i];
        directions.forEach(direction => {
            if (this.boardUtility.positionOnBoard(i + direction[0], j + direction[1])) {
                let iNew = i + direction[0];
                let jNew = j + direction[1];
                let currentSquare = this.board[jNew][iNew];
                let checkPin = false;
                for (let index = 0; index < this.currentCheckingPieces.length; index++) {
                    let blockLocation = this.currentCheckingPieces[index];
                    let checkPinForward = blockLocation.has(10 * iNew + jNew) && blockLocation.size > 1;
                    let checkPinBackward = blockLocation.has(10 * (i - direction[0]) + j - direction[1]) && this.board[j - direction[1]][i - direction[0]][1] != "P";
                    checkPin = checkPinForward || checkPinBackward;
                    if (checkPin) {
                        break;
                    };
                };
                if (currentSquare[0] != color && !this.boardUtility.opponentAttackSquare([iNew, jNew], oppositeColor, this.board) && !checkPin) {
                    this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [iNew, jNew], movingPiece, this.board[jNew][iNew]);
                    this.numberOfPossibleMoves++;
                };
            };
        });
        switch(color) {
            case "w":
                if (this.whiteCanCastle[0] && this.board[7][0] == "wR" && this.board[7][1] == "--" && this.board[7][2] == "--" && this.board[7][3] == "--") {
                    if (!this.boardUtility.opponentAttackSquare([2, 7], oppositeColor, this.board) && !this.boardUtility.opponentAttackSquare([3, 7], oppositeColor, this.board) && this.currentCheckingPieces.length == 0) {
                        // white castle long
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [2, 7], movingPiece, "--", false, true);
                        this.numberOfPossibleMoves++;
                    };
                };
                if (this.whiteCanCastle[1] && this.board[7][7] == "wR" && this.board[7][5] == "--" && this.board[7][6] == "--") {
                    if (!this.boardUtility.opponentAttackSquare([5, 7], oppositeColor, this.board) && !this.boardUtility.opponentAttackSquare([6, 7], oppositeColor, this.board) && this.currentCheckingPieces.length == 0) {
                        // white castle short
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [6, 7], movingPiece, "--", false, true);
                        this.numberOfPossibleMoves++;
                    };
                };
                break;
            case "b":
                if (this.blackCanCastle[0] && this.board[0][0] == "bR" && this.board[0][1] == "--" && this.board[0][2] == "--" && this.board[0][3] == "--") {
                    if (!this.boardUtility.opponentAttackSquare([2, 0], oppositeColor, this.board) && !this.boardUtility.opponentAttackSquare([3, 0], oppositeColor, this.board) && this.currentCheckingPieces.length == 0) {
                        // black castle long
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [2, 0], movingPiece, "--", false, true);
                        this.numberOfPossibleMoves++;
                    };
                };
                if (this.blackCanCastle[1] && this.board[0][7] == "bR" && this.board[0][5] == "--" && this.board[0][6] == "--") {
                    if (!this.boardUtility.opponentAttackSquare([5, 0], oppositeColor, this.board) && !this.boardUtility.opponentAttackSquare([6, 0], oppositeColor, this.board) && this.currentCheckingPieces.length == 0) {
                        // black castle short
                        this.possibleMoves[this.numberOfPossibleMoves] = new Move(pieceLocation, [6, 0], movingPiece, "--", false, true);
                        this.numberOfPossibleMoves++;
                    };
                };
                break;
        };
    };

    positionFromFen(fenString) {
        const [board, playerToMove, castling, enPassant, halfMoveClock, fullMoveClock] = fenString.split(" ");
        const rows = board.split("/");

        for (let key in this.pieces) {
            this.pieces[key] = new Set();
        };
        for (let key in this.pieceBitBoards) {
            this.pieceBitBoards[key] = BigInt(0);
        };

        for (let row = 0; row < 8; row++) {
            const currentRow = rows[row];
            let column = 0;
            let j = 0;
            while (j < currentRow.length) {
                const char = currentRow[j];
                if (!isNaN(char)) {
                    const emptySquares = parseInt(char);
                    for (let i = column; i < column + emptySquares; i++) {
                        this.board[row][i] = "--";
                    };
                    column += emptySquares;
                } else {
                    if (char === char.toLowerCase()) { // black
                        const piece = "b" + char.toUpperCase();
                        const index = this.boardUtility.squareToIndex([column, row]);
                        this.board[row][column] = piece;
                        this.pieces[piece].add(index);
                        this.pieceBitBoards[piece] = this.pieceBitBoards[piece] | (1n << BigInt(index));
                    } else { // white
                        const piece = "w" + char.toUpperCase();
                        const index = this.boardUtility.squareToIndex([column, row]);
                        this.board[row][column] = piece;
                        this.pieces[piece].add(index);
                        this.pieceBitBoards[piece] = this.pieceBitBoards[piece] | (1n << BigInt(index))
                    };
                    column++;
                };
                j++;
            };
        };

        this.whiteToMove = playerToMove === "w";

        this.blackCanCastle = [false, false];
        this.whiteCanCastle = [false, false];
        for (let i = 0; i < castling.length; i++) {
            const char = castling[i];
            switch(char) {
                case "K":
                    this.whiteCanCastle[1] = true;
                    break;
                case "Q":
                    this.whiteCanCastle[0] = true;
                    break;
                case "k":
                    this.blackCanCastle[1] = true;
                    break;
                case "q":
                    this.blackCanCastle[0] = true;
                    break;
            };
        };
        
        if (enPassant !== "-") {
            const column = numberPositions[enPassant[0]];
            const row = parseInt(enPassant[1]);
            this.enPassant = [column, row];
        };

        fiftyMoveCounter = [parseInt(halfMoveClock)];
        this.ply = (fullMoveClock - 1) * 2 + (this.whiteToMove ? 0 : 1);

        const [whitePiecePositionBonus, blackPiecePositionBonus, whitePiecePositionBonusEg, blackPiecePositionBonusEg] = this.boardUtility.countPiecePositionBonus(this.board);
        this.whitePiecePositionBonus = whitePiecePositionBonus;
        this.blackPiecePositionBonus = blackPiecePositionBonus;
        this.whitePiecePositionBonusEg = whitePiecePositionBonusEg;
        this.blackPiecePositionBonusEg = blackPiecePositionBonusEg;
        this.zobristHash = this.boardUtility.generateZobristHash(this.board, this.enPassant, this.whiteCanCastle, this.blackCanCastle, this.whiteToMove);
    };

    getFen() {
        let fen = "";
        for (let row = 0; row < 8; row++) {
            let space = 0;
            for (let column = 0; column < 8; column++) {
                const piece = this.board[row][column];
                if (piece == "--") {
                    space++;
                } else {
                    let number = "";
                    if (space > 0) {
                        number = space.toString();
                        space = 0;
                    } ;
                    const nextElement = number + (piece[0] == "w" ? piece[1] : piece[1].toLowerCase());
                    fen = fen + nextElement;
                };
                if (space > 0 && column == 7) {
                    fen = fen + space.toString();
                };
            };
            fen = fen + (row < 7 ? "/" : "");
        };

        fen = fen + " " + (this.whiteToMove ? "w" : "b");
        fen = fen + " " + (this.whiteCanCastle[0] ? "K" : "");
        fen = fen + (this.whiteCanCastle[1] ? "Q" : "");
        fen = fen + (this.blackCanCastle[0] ? "k" : "");
        fen = fen + (this.blackCanCastle[1] ? "q" : "");
        if (!(this.whiteCanCastle[0] || this.whiteCanCastle[1] || this.blackCanCastle[0] || this.blackCanCastle[1])) {
            fen = fen + "-";
        };

        if (this.enPassant.length > 0 && this.whiteToMove) {
            fen = fen + " " + boardPositions[this.enPassant[0]] + (8 - (this.enPassant[1] - 1));
        } else if (this.enPassant.length > 0 && !this.whiteToMove) {
            fen = fen + " " + (boardPositions[this.enPassant[0]] + (this.enPassant[1] - 1));
        } else {
            fen = fen + " -";
        };

        fen = fen + " " + fiftyMoveCounter[fiftyMoveCounter.length - 1] + " " + (Math.floor(this.ply / 2) + 1);

        return fen;
    };

    inCheck() {
        return this.currentCheckingPieces.length > 0;
    };

    getKingPosition(color) {
        let positionIndex;
        if (color == "w") {
            positionIndex = Array.from(this.pieces["wK"])[0];
        } else {
            positionIndex = Array.from(this.pieces["bK"])[0];
        };
        return this.boardUtility.indexToSquare(positionIndex);
    };

    getMaterial(color) {
        let material = 0;
        for (let piece in this.pieces) {
            if (piece[0] == color) {
                material += pieceValues[piece[1]] * this.pieces[piece].size;
            };
        };
        return material;
    };

    getPieceMaterial(color) {
        let material = 0;
        for (let piece of pieces) {
            const coloredPiece = color + piece;
            material += pieceValues[piece] * this.pieces[coloredPiece].size;
        };
        return material;
    };

    makeNullMove() {
        // update zobrist hash
        this.zobristHash = this.zobristHash ^ randomSideKey;
        this.zobristHash = this.boardUtility.updateZobristHashEnPassant(this.zobristHash, this.enPassant);
        

        // update moving player
        this.whiteToMove = !this.whiteToMove;

        // get new moves for the other player
        this.getPossibleMoves();

        // put the null move into the movelog to get en passant back after undoing the move
        this.moveLog.push([new Move([0, 0], [0, 0], "wP", "--"), this.whiteCanCastle, this.blackCanCastle, this.enPassant]);

        this.enPassant = [];
        // update zobrist hash again to get correct en passant
        this.zobristHash = this.boardUtility.updateZobristHashEnPassant(this.zobristHash, this.enPassant);
    };

    undoNullMove() {
        // update zobrist hash back
        this.zobristHash = this.zobristHash ^ randomSideKey;
        this.zobristHash = this.boardUtility.updateZobristHashEnPassant(this.zobristHash, this.enPassant);

        // get old en passant back
        const [move, whiteCanCastle, blackCanCastle, possibleEnPassant] = this.moveLog.pop();
        this.enPassant = possibleEnPassant;

        // update corrent zobrist hash
        this.zobristHash = this.boardUtility.updateZobristHashEnPassant(this.zobristHash, this.enPassant);

        // update moving player back
        this.whiteToMove = !this.whiteToMove;
    };
};

class boardUtils {
    constructor() {
        this.attackSquareTime = 0;
    };

    positionOnBoard(i, j) {
        return (0 <= i && i < 8 && 0 <= j && j < 8)
    };

    isCheckMate(possibleMovesLength, currentCheckingPiecesLength) {
        return (possibleMovesLength == 0 && currentCheckingPiecesLength > 0)
    };

    pieceInPinnedPieces(i, j, currentPinnedPieces) {
        let positionHash = 10 * i + j;
        let directions = [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 1], [0, -1], [-1, 0], [1, 0]];
        return [currentPinnedPieces.get(positionHash) != undefined, directions[currentPinnedPieces.get(positionHash)]];
    };

    // returns false if en passant is not possible due to pinned king, else returns true
    enPassantPin(pawnPosition, takenPosition, color, oppositeColor, ownKingPosition, board) {
        if (pawnPosition[1] != ownKingPosition[1]) {
            return true
        } else {
            let direction = pawnPosition[0] < ownKingPosition[0] ? [-1, 0] : [1, 0];
            let n = 1;
            while (this.positionOnBoard(ownKingPosition[0] + n * direction[0], ownKingPosition[1])) {
                let iNew = ownKingPosition[0] + n * direction[0];
                let jNew = ownKingPosition[1];
                if ((iNew == pawnPosition[0] && jNew == pawnPosition[1]) || (iNew == takenPosition[0] && jNew == takenPosition[1])) {
                    n++;
                    continue;
                } else {
                    if (board[jNew][iNew][0] == color) {
                        return true;
                    } else if (board[jNew][iNew][0] == oppositeColor && (board[jNew][iNew][1] == "Q" || board[jNew][iNew][1] == "R")) {
                        return false;
                    } else if (board[jNew][iNew][0] == oppositeColor) {
                        return true;
                    };
                    n++;
                };
            };
            return true;
        };
    };

    opponentAttackSquare(position, oppositeColor, board) {
        const start = performance.now()
        let [i, j] = position;
        let directions = [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 1], [0, -1], [-1, 0], [1, 0]];
        for (var index = 0; index < directions.length; index++) {
            let direction = directions[index];
            let n = 1;
            while (this.positionOnBoard(i + n * direction[0], j + n * direction[1])) {
                let iNew = i + n * direction[0];
                let jNew = j + n * direction[1];
                let currentPiece = board[jNew][iNew];
                if (currentPiece[0] == oppositeColor && ((index < 4 && (currentPiece[1] == "B" || currentPiece[1] == "Q")) || 
                (index >= 4 && (currentPiece[1] == "R" || currentPiece[1] == "Q")) || 
                (n == 1 && currentPiece[1] == "K"))) {
                    this.attackSquareTime += (performance.now() - start)
                    return true;
                } else if (currentPiece != "--") {
                    break;
                };
                n++;
            };
        };
        let moveDifferences = [[-1, 2], [1, 2], [-1, -2], [1, -2], [-2, 1], [2, 1], [-2, -1], [2, -1]];
        for (let index = 0; index < moveDifferences.length; index++) {
            let xyDiff = moveDifferences[index];
            let iNew = i + xyDiff[0];
            let jNew = j + xyDiff[1];
            if (this.positionOnBoard(iNew, jNew)) {
                let currentPiece = board[jNew][iNew];
                if (currentPiece[0] == oppositeColor && currentPiece[1] == "N") {
                    this.attackSquareTime += (performance.now() - start)
                    return true;
                };
            };
        };
        if (oppositeColor == "w") {
            if ((this.positionOnBoard(i - 1, j + 1) && board[j + 1][i - 1][1] == "P" && board[j + 1][i - 1][0] == oppositeColor) || 
            (this.positionOnBoard(i + 1, j + 1) && board[j + 1][i + 1][1] == "P" && board[j + 1][i + 1][0] == oppositeColor)) {
                this.attackSquareTime += (performance.now() - start)
                return true;
            };
        } else {
            if ((this.positionOnBoard(i - 1, j - 1) && board[j - 1][i - 1][1] == "P" && board[j - 1][i - 1][0] == oppositeColor) || 
            (this.positionOnBoard(i + 1, j - 1) && board[j - 1][i + 1][1] == "P" && board[j - 1][i + 1][0] == oppositeColor)) {
                this.attackSquareTime += (performance.now() - start)
                return true;
            };
        };
        this.attackSquareTime += (performance.now() - start)
        return false;
    };

    countPiecePositionBonus(board) {
        let blackPieceBonus = 0
        let whitePieceBonus = 0
        let blackPieceBonusEg = 0
        let whitePieceBonusEg = 0
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                if (board[j][i][0] == "w") {
                    whitePieceBonus += startPieceSquareValues[board[j][i][1]][j][i];
                    whitePieceBonusEg += endPieceSquareValues[board[j][i][1]][j][i];
                } else if (board[j][i][0] == "b") {
                    blackPieceBonus += startPieceSquareValues[board[j][i][1]][7 - j][i];
                    blackPieceBonusEg += endPieceSquareValues[board[j][i][1]][7 - j][i];
                };
            };
        };
        return [whitePieceBonus, blackPieceBonus, whitePieceBonusEg, blackPieceBonusEg]
    };

    updateZobristHashCastlingRights(zobristHash, whiteCanCastle, blackCanCastle) {
        const castleIndex = whiteCanCastle[0] * 8 + whiteCanCastle[1] * 4 + blackCanCastle[0] * 2 + blackCanCastle[1];
        const randomCastleKey = randomCastlingKeys[castleIndex];
        return zobristHash ^ randomCastleKey;
    };

    updateZobristHashEnPassant(zobristHash, enPassant) {
        if (enPassant.length == 0) {
            return zobristHash;
        };

        const enPassantSquareIndex = this.squareToIndex(enPassant);
        const enPassantRandomKey = randomEnPassantKeys[enPassantSquareIndex];
        zobristHash = zobristHash ^ enPassantRandomKey;
        return zobristHash;
    };

    updateZobristHash(zobristHash, move, whiteMove, enPassant) {
        // update side
        zobristHash = zobristHash ^ randomSideKey;

        // update start and end squares
        const startPosIndex = this.squareToIndex(move.startPos);
        const endPosIndex = this.squareToIndex(move.endPos);
        const movingPieceIndex = pieceToIndex[move.movingPiece];
        const takenPieceIndex = move.takenPiece == "--" ? -1 : pieceToIndex[move.takenPiece];
        const startPosRandomKey = randomPieceKeys[movingPieceIndex][startPosIndex];
        const endPosRandomKey = randomPieceKeys[movingPieceIndex][endPosIndex];
        const takenPieceRandomKey = takenPieceIndex == -1 ? 0n : randomPieceKeys[takenPieceIndex][endPosIndex];
        zobristHash = zobristHash ^ startPosRandomKey;
        zobristHash = zobristHash ^ endPosRandomKey;
        zobristHash = zobristHash ^ takenPieceRandomKey;
        if (move.enPassant) { // if move is en passant, update taken piece
            if (whiteMove) {
                const takenPieceIndex = 11;
                const takenPosIndex = this.squareToIndex([move.endPos[0], move.endPos[1] + 1]);
                const takenPieceRandomKey = randomPieceKeys[takenPieceIndex][takenPosIndex];
                zobristHash = zobristHash ^ takenPieceRandomKey;
            } else {
                const takenPieceIndex = 5;
                const takenPosIndex = this.squareToIndex([move.endPos[0], move.endPos[1] - 1]);
                const takenPieceRandomKey = randomPieceKeys[takenPieceIndex][takenPosIndex];
                zobristHash = zobristHash ^ takenPieceRandomKey;
            };
        };

        if (move.castleKing) { // if move was castling, update rook position
            let startPosRandomKey;
            let endPosRandomKey;
            if (whiteMove) {
                let rookStartPosIndex;
                let rookEndPosIndex;
                if (move.endPos[0] - move.startPos[0] > 0) { // castle short
                    rookStartPosIndex = 63;
                    rookEndPosIndex = 61;
                } else { // castle long
                    rookStartPosIndex = 56;
                    rookEndPosIndex = 59;
                };
                const whiteRookPieceIndex = 2;
                startPosRandomKey = randomPieceKeys[whiteRookPieceIndex][rookStartPosIndex];
                endPosRandomKey = randomPieceKeys[whiteRookPieceIndex][rookEndPosIndex];
            } else {
                let rookStartPosIndex;
                let rookEndPosIndex;
                if (move.endPos[0] - move.startPos[0] > 0) { // castle short
                    rookStartPosIndex = 7;
                    rookEndPosIndex = 5;
                } else { // castle long
                    rookStartPosIndex = 0;
                    rookEndPosIndex = 3;
                };
                const blackRookPieceIndex = 8;
                startPosRandomKey = randomPieceKeys[blackRookPieceIndex][rookStartPosIndex];
                endPosRandomKey = randomPieceKeys[blackRookPieceIndex][rookEndPosIndex];
            };
            zobristHash = zobristHash ^ startPosRandomKey;
            zobristHash = zobristHash ^ endPosRandomKey;
        };

        return zobristHash;
    };

    getMaterialDiffs(move, undo = false) {
        if (!undo) {
            let whitePiecePositionBonusDiff = 0;
            let blackPiecePositionBonusDiff = 0;
            let whitePiecePositionBonusDiffEg = 0;
            let blackPiecePositionBonusDiffEg = 0;
            const playerDiff = move.movingPiece[0] == "w" ? 1 : -1;
            let [i, j] = playerDiff == 1 ? move.startPos : [7 - move.startPos[0], 7 - move.startPos[1]];
            let [iNew, jNew] = playerDiff == 1 ? move.endPos : [7 - move.endPos[0], 7 - move.endPos[1]];



            // update taken piece materials and piece position bonuses
            if (move.takenPiece[0] != "--" || move.enPassant) {
                const piecePositionBonusDiff = move.enPassant ? startPieceSquareValues[move.takenPiece[1]][jNew + playerDiff][iNew] : startPieceSquareValues[move.takenPiece[1]][jNew][iNew];
                const piecePositionBonusDiffEg = move.enPassant ? endPieceSquareValues[move.takenPiece[1]][jNew + playerDiff][iNew] : endPieceSquareValues[move.takenPiece[1]][jNew][iNew];
                switch(move.movingPiece[0]) {
                    case "b":
                        whitePiecePositionBonusDiff -= piecePositionBonusDiff;
                        whitePiecePositionBonusDiffEg -= piecePositionBonusDiffEg;
                        break;
                    case "w":
                        blackPiecePositionBonusDiff -= piecePositionBonusDiff;
                        blackPiecePositionBonusDiffEg -= piecePositionBonusDiffEg;
                        break;
                };
            };

            // update moving piece position bonuses and materials if promotion
            const oldPiecePositioningBonus = startPieceSquareValues[move.movingPiece[1]][j][i];
            const newPiecePositioningBonus = move.promotion ? startPieceSquareValues[move.promotedPiece[1]][jNew][iNew] : startPieceSquareValues[move.movingPiece[1]][jNew][iNew];
            const piecePositioningBonusDiff = newPiecePositioningBonus - oldPiecePositioningBonus;
            const oldPiecePositioningBonusEg = endPieceSquareValues[move.movingPiece[1]][j][i];
            const newPiecePositioningBonusEg = move.promotion ? endPieceSquareValues[move.promotedPiece[1]][jNew][iNew] : endPieceSquareValues[move.movingPiece[1]][jNew][iNew];
            const piecePositioningBonusDiffEg = newPiecePositioningBonusEg - oldPiecePositioningBonusEg;
            switch(move.movingPiece[0]) {
                case "w":
                    whitePiecePositionBonusDiff += piecePositioningBonusDiff;
                    whitePiecePositionBonusDiffEg += piecePositioningBonusDiffEg;
                    break;
                case "b":
                    blackPiecePositionBonusDiff += piecePositioningBonusDiff;
                    blackPiecePositionBonusDiffEg += piecePositioningBonusDiffEg;
                    break;
            };

            if (move.castleKing) { 
                // if long castle, rook positioning value changes
                const newRookBonus = move.endPos[0] < move.startPos[0] ? startPieceSquareValues["R"][7][3] : startPieceSquareValues["R"][7][5];
                const oldRookBonus = move.endPos[0] < move.startPos[0] ? startPieceSquareValues["R"][7][0] : startPieceSquareValues["R"][7][7];
                const newRookBonusEg = move.endPos[0] < move.startPos[0] ? endPieceSquareValues["R"][7][3] : endPieceSquareValues["R"][7][5];
                const oldRookBonusEg = move.endPos[0] < move.startPos[0] ? endPieceSquareValues["R"][7][0] : endPieceSquareValues["R"][7][7];
                const rookBonusDiff = newRookBonus - oldRookBonus;
                const rookBonusDiffEg = newRookBonusEg - oldRookBonusEg;
                switch(move.movingPiece[0]) {
                    case "w":
                        whitePiecePositionBonusDiff += rookBonusDiff;
                        whitePiecePositionBonusDiffEg += rookBonusDiffEg;
                        break;
                    case "b":
                        blackPiecePositionBonusDiff += rookBonusDiff;
                        blackPiecePositionBonusDiffEg += rookBonusDiffEg;
                        break;
                };
            };

            return [whitePiecePositionBonusDiff, blackPiecePositionBonusDiff, whitePiecePositionBonusDiffEg, blackPiecePositionBonusDiffEg];
        } else {
            let whitePiecePositionBonusDiff = 0;
            let blackPiecePositionBonusDiff = 0;
            let whitePiecePositionBonusDiffEg = 0;
            let blackPiecePositionBonusDiffEg = 0;
            const playerDiff = move.movingPiece[0] == "w" ? 1 : -1;
            let [i, j] = playerDiff == 1 ? move.startPos : [7 - move.startPos[0], 7 - move.startPos[1]];
            let [iNew, jNew] = playerDiff == 1 ? move.endPos : [7 - move.endPos[0], 7 - move.endPos[1]];

            // update taken piece materials and piece position bonuses
            if (move.takenPiece[0] != "--" || move.enPassant) {
                const piecePositionBonusDiff = move.enPassant ? startPieceSquareValues[move.takenPiece[1]][jNew + playerDiff][iNew] : startPieceSquareValues[move.takenPiece[1]][jNew][iNew];
                const piecePositionBonusDiffEg = move.enPassant ? endPieceSquareValues[move.takenPiece[1]][jNew + playerDiff][iNew] : endPieceSquareValues[move.takenPiece[1]][jNew][iNew];
                switch(move.movingPiece[0]) {
                    case "b":
                        whitePiecePositionBonusDiff += piecePositionBonusDiff;
                        whitePiecePositionBonusDiffEg += piecePositionBonusDiffEg;
                        break;
                    case "w":
                        blackPiecePositionBonusDiff += piecePositionBonusDiff;
                        blackPiecePositionBonusDiffEg += piecePositionBonusDiffEg;
                        break;
                };
            };
            // update moving piece position bonuses and materials if promotion
            const oldPiecePositioningBonus = startPieceSquareValues[move.movingPiece[1]][j][i];
            const newPiecePositioningBonus = move.promotion ? startPieceSquareValues[move.promotedPiece[1]][jNew][iNew] : startPieceSquareValues[move.movingPiece[1]][jNew][iNew];
            const piecePositioningBonusDiff = newPiecePositioningBonus - oldPiecePositioningBonus;
            const oldPiecePositioningBonusEg = endPieceSquareValues[move.movingPiece[1]][j][i];
            const newPiecePositioningBonusEg = move.promotion ? endPieceSquareValues[move.promotedPiece[1]][jNew][iNew] : endPieceSquareValues[move.movingPiece[1]][jNew][iNew];
            const piecePositioningBonusDiffEg = newPiecePositioningBonusEg - oldPiecePositioningBonusEg;
            switch(move.movingPiece[0]) {
                case "w":
                    whitePiecePositionBonusDiff -= piecePositioningBonusDiff;
                    whitePiecePositionBonusDiffEg -= piecePositioningBonusDiffEg;
                    break;
                case "b":
                    blackPiecePositionBonusDiff -= piecePositioningBonusDiff;
                    blackPiecePositionBonusDiffEg -= piecePositioningBonusDiffEg;
                    break;
            };

            if (move.castleKing) {
                // if long castle, rook positioning value changes
                const newRookBonus = move.endPos[0] < move.startPos[0] ? startPieceSquareValues["R"][7][3] : startPieceSquareValues["R"][7][5];
                const oldRookBonus = move.endPos[0] < move.startPos[0] ? startPieceSquareValues["R"][7][0] : startPieceSquareValues["R"][7][7];
                const newRookBonusEg = move.endPos[0] < move.startPos[0] ? endPieceSquareValues["R"][7][3] : endPieceSquareValues["R"][7][5];
                const oldRookBonusEg = move.endPos[0] < move.startPos[0] ? endPieceSquareValues["R"][7][0] : endPieceSquareValues["R"][7][7];
                const rookBonusDiff = newRookBonus - oldRookBonus;
                const rookBonusDiffEg = newRookBonusEg - oldRookBonusEg;
                switch(move.movingPiece[0]) {
                    case "w":
                        whitePiecePositionBonusDiff -= rookBonusDiff;
                        whitePiecePositionBonusDiffEg -= rookBonusDiffEg;
                        break;
                    case "b":
                        blackPiecePositionBonusDiff -= rookBonusDiff;
                        blackPiecePositionBonusDiffEg -= rookBonusDiffEg;
                        break;
                };
            };

            return [whitePiecePositionBonusDiff, blackPiecePositionBonusDiff, whitePiecePositionBonusDiffEg, blackPiecePositionBonusDiffEg];
        };
    };

    squareToIndex(square) {
        return square[0] + 8 * square[1];
    };

    indexToSquare(index) {
        return [index % 8, Math.floor(index / 8)];
    };

    generateZobristHash(board, enPassant, whiteCanCastle, blackCanCastle, whiteToMove) {
        let hash = 0n;
        for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
                const piece = board[j][i];
                if (piece != "--") {
                    const pieceIndex = pieceToIndex[piece];
                    const squareIndex = this.squareToIndex([i, j]);
                    const randomPieceKey = randomPieceKeys[pieceIndex][squareIndex];
                    hash = hash ^ randomPieceKey;
                };
            };
        };

        if (enPassant.length != 0) {
            const enPassantSquareIndex = this.squareToIndex(enPassant);
            const randomEnPassantKey = randomEnPassantKeys[enPassantSquareIndex];
            hash = hash ^ randomEnPassantKey;
        };

        const castleIndex = whiteCanCastle[0] * 8 + whiteCanCastle[1] * 4 + blackCanCastle[0] * 2 + blackCanCastle[1];
        const randomCastleKey = randomCastlingKeys[castleIndex];
        hash = hash ^ randomCastleKey;

        if (!whiteToMove) {
            hash = hash ^ randomSideKey;
        };

        return hash;
    };
};

class Move {
    constructor(startPos, endPos, movingPiece, takenPiece, promotion = false, castleKing = false, enPassant = false, promotedPiece = null) {
        this.startPos = startPos;
        this.endPos = endPos;
        this.promotion = promotion;
        this.promotedPiece = promotedPiece
        this.castleKing = castleKing;
        this.enPassant = enPassant;
        this.takenPiece = takenPiece
        this.movingPiece = movingPiece
        this.assumedMoveScore = 0;
    };

    equals(move) {
        return (this.startPos[0] == move.startPos[0] && this.startPos[1] == move.startPos[1]) && (this.endPos[0] == move.endPos[0] && 
            this.endPos[1] == move.endPos[1]) && (this.promotion == move.promotion) && (this.castleKing == move.castleKing) && 
            (this.enPassant == move.enPassant) && (this.promotedPiece == move.promotedPiece);
    };

    isCapture() {
        return this.takenPiece != "--" || this.enPassant;
    };

    isPieceCapture() {
        return pieces.has(this.takenPiece[1]);
    };

    convertToString() {
        return boardPositions[this.startPos[0]] + (8 - this.startPos[1]) + boardPositions[this.endPos[0]] + (8 - this.endPos[1]);
    };
};