class historyTable {
    constructor() {
        this.table = new Array(12).fill( new Array(64).fill(0) );
    };

    clear() {
        this.table = new Array(12).fill( new Array(64).fill(0) );
    };

    add(move, increment) {
        if (!move.isCapture()) {
            const piece = move.movingPiece;
            const square = move.endPos;
            const squareIndex = square[0] + 8 * square[1];
            this.table[pieceToIndex[piece]][squareIndex] += increment;
        };
    };

    get(move) {
        const piece = move.movingPiece;
        const square = move.endPos;
        const squareIndex = square[0] + 8 * square[1];
        return this.table[pieceToIndex[piece]][squareIndex];
    };
};
