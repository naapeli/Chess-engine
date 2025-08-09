const hFileMask = 0x0101010101010101n;
const cutMask = 0xFFFFFFFFFFFFFFFFn;
const singleRankMask = 0xFFn;

const whitePassedPawnMask = new Array(64);
const blackPassedPawnMask = new Array(64);

const doubledPawnMask = new Array(64);
const isolatedPawnMask = new Array(8);

const whiteKingPawnShield = new Array(64);
const blackKingPawnShield = new Array(64);

const tripleFile = new Array(64);
const whiteRookOpenFileMask = new Array(64);
const blackRookOpenFileMask = new Array(64);

const bishopOpenLineMask = new Array(64);

function initBitboards() {
    for (let index = 0; index < 64; index++) {
        const [i, j] = [index % 8, Math.floor(index / 8)];
        const fileMask = (hFileMask << BigInt(i)) & cutMask;
        doubledPawnMask[index] = fileMask & (cutMask ^ (BigInt(1) << BigInt(index)));
        const rightMask = (hFileMask << BigInt(Math.min(i + 1, 7))) & cutMask;
        const leftmask = (hFileMask << BigInt(Math.max(i - 1, 0))) & cutMask;
        if (i == 0) {
            isolatedPawnMask[i] = rightMask;
        } else if (i == 7) {
            isolatedPawnMask[i] = leftmask;
        } else {
            isolatedPawnMask[i] = rightMask | leftmask;
        };
        const tripleFileMask = fileMask | rightMask | leftmask;
        tripleFile[index] = tripleFileMask;
        const whiteFrontMask = (cutMask >> BigInt(8 * (8 - j))) & cutMask;
        const blackFrontMask = (cutMask << BigInt(8 * (j + 1))) & cutMask;
        whitePassedPawnMask[index] = whiteFrontMask & tripleFileMask;
        blackPassedPawnMask[index] = blackFrontMask & tripleFileMask;

        whiteRookOpenFileMask[index] = whiteFrontMask & fileMask;
        blackRookOpenFileMask[index] = blackFrontMask & fileMask;

        const whiteKingFrontMask = ((singleRankMask << BigInt(8 * (j - 1))) | (singleRankMask << BigInt(8 * (j - 2)))) & cutMask;
        const blackKingFrontMask = ((singleRankMask << BigInt(8 * (j + 1))) | (singleRankMask << BigInt(8 * (j + 2)))) & cutMask;
        whiteKingPawnShield[index] = whiteKingFrontMask & tripleFileMask;
        blackKingPawnShield[index] = blackKingFrontMask & tripleFileMask;

        let bishopMask = 0x0n;
        const offSets = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (let offset of offSets) {
            let [x, y] = offset;
            let currentPosition = [i + x, j + y];
            while ((0 <= currentPosition[0] && currentPosition[0] < 8 && 0 <= currentPosition[1] && currentPosition[1] < 8)) {
                const currentIndex = currentPosition[0] + 8 * currentPosition[1];
                bishopMask = bishopMask | (0x1n << BigInt(currentIndex));
                currentPosition = [currentPosition[0] + x, currentPosition[1] + y];
            };
        };
        bishopOpenLineMask[index] = bishopMask;
    };
};

initBitboards();
