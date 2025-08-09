class transpositionTable {
    constructor() {
        this.size = this.getSizeOfArray();
        this.positionLookUp = new Array(parseInt(this.size));
        this.positionsInLookUp = 0;
        this.CHECKMATE = 10000000;
    };

    getSizeOfArray() { // for now use 4 000 000 positions
        return 4000000n;
    };

    getIndex(zobristHash) {
        return zobristHash % this.size;
    };

    clearTable() {
        this.positionLookUp = new Array(parseInt(this.size));
    };

    getEntryFromHash(zobristHash) {
        const index = this.getIndex(zobristHash);
        const entry = this.positionLookUp[index];
        return entry;
    };

    getBestMoveFromHash(zobristHash) {
        const index = this.getIndex(zobristHash);
        const entry = this.positionLookUp[index];
        if (entry != undefined) {
            return [true, entry.bestMove];
        } else {
            return [false];
        };
    };

    storeEvaluation(zobristHash, evaluation, depthFromPosition, nodeType, bestMove, depthFromRoot) {
        const index = this.getIndex(zobristHash);
        const overWritten = this.positionLookUp[index] != undefined;
        if (!overWritten) {
            this.positionsInLookUp++;
            this.positionLookUp[index] = new Entry(zobristHash, evaluation, depthFromPosition, nodeType, bestMove);
        } else {
            // if collision with the same position from lower depth or some other position, store new evaluation
            if (this.positionLookUp[index].zobristHash == zobristHash) {
                if (this.positionLookUp[index].depth <= depthFromPosition) {
                    this.positionLookUp[index] = new Entry(zobristHash, evaluation, depthFromPosition, nodeType, bestMove);
                };
            } else {
                this.positionLookUp[index] = new Entry(zobristHash, evaluation, depthFromPosition, nodeType, bestMove);
            };
        };
    };

    printLookUpTable() {
        this.positionLookUp.forEach(entry => {
            if (entry != undefined) {
                console.log(entry)
            };
        });
    };
};

class Entry {
    constructor(zobristHash, evaluation, depthFromPosition, nodeType, bestMove) {
        this.zobristHash = zobristHash;
        this.evaluation = evaluation;
        this.depth = depthFromPosition;
        this.nodeType = nodeType; // 0 if evaluation is exact, 1 if alpha, 2 if beta
        this.bestMove = bestMove;
    };
};