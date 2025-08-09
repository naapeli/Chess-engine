import chess

def count_positions(fen, depth):
    board = chess.Board(fen)
    board.push(chess.Move.from_uci("g1h3"))
    #board.push(chess.Move.from_uci("b2a1q"))

    def perft(board, ply):
        if ply == 0:
            return 1
        
        total_positions = 0
        legal_moves = list(board.legal_moves)

        for move in legal_moves:
            board.push(move)
            total_positions += perft(board, ply - 1)
            board.pop()
        
        return total_positions

    positions_count = {}
    legal_moves = list(board.legal_moves)

    for move in legal_moves:
        board.push(move)
        positions_count[move] = perft(board, depth - 1)
        board.pop()
    
    return positions_count

# Example usage
fen_string = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
ply = 2  # Specify the number of half-moves
move_counts = count_positions(fen_string, ply)

sum = 0
for move, count in move_counts.items():
    sum += count
    print(f"{move}: {count}")
print(f"Total: {sum}")
