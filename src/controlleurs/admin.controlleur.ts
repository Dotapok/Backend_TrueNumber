import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import User from '../modeles/utilisateur.modele';
import { ApiResponse } from '../utilitaires/reponseApi';
import { Game } from '../modeles/game.modele';

// Étend l'interface Request pour inclure la propriété user
interface AuthRequest extends Request {
  user?: {
    _id: string;
    role: string;
  };
}


/**
 * Récupère l'historique complet de toutes les parties (admin seulement)
 */
export const getAllGames = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        // Récupération des parties avec pagination et population des infos utilisateur
        const [games, totalGames] = await Promise.all([
            Game.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate<{userId: {_id: Types.ObjectId, firstName: string, lastName: string} | null}>(
                    'userId', 
                    'firstName lastName'
                )
                .lean(),
            Game.countDocuments()
        ]);

        // Formater les données en gérant les userId null
        const formattedGames = games.map(game => ({
            _id: game._id,
            user: game.userId ? {
                _id: game.userId._id,
                firstName: game.userId.firstName,
                lastName: game.userId.lastName
            } : null,
            number: game.number,
            result: game.result,
            pointsChange: game.pointsChange,
            newBalance: game.balanceAfter,
            createdAt: game.createdAt
        }));

        res.status(200).json(
            new ApiResponse(
                200,
                'Historique des parties récupéré avec succès',
                {
                    games: formattedGames,
                    pagination: {
                        total: totalGames,
                        page,
                        pages: Math.ceil(totalGames / limit),
                        limit
                    }
                }
            )
        );
    } catch (error) {
        console.error('Erreur dans getAllGames:', error);
        res.status(500).json(
            new ApiResponse(500, 'Erreur lors de la récupération de l\'historique des parties')
        );
    }
};

/**
 * Récupère tous les utilisateurs (pour l'admin)
 */
export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const users = await User.find({}, { password: 0 });
        res.status(200).json(
            new ApiResponse(200, 'Utilisateurs récupérés avec succès', users)
        );
    } catch (error) {
        console.error('Erreur dans getAllUsers:', error);
        res.status(500).json(
            new ApiResponse(500, 'Erreur lors de la récupération des utilisateurs')
        );
    }
};

/**
 * Crée un nouvel utilisateur (admin seulement)
 */
export const createUser = async (req: Request, res: Response) => {
    try {
        const { firstName, lastName, email, phone, password, role } = req.body;

        // Validation des données
        if (!firstName || !lastName || !email || !phone || !password) {
            return res.status(400).json(
                new ApiResponse(400, 'Tous les champs obligatoires doivent être remplis')
            );
        }

        // Vérifie si l'utilisateur existe déjà
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json(
                new ApiResponse(400, 'Un utilisateur avec cet email existe déjà')
            );
        }

        const user = new User({ 
            firstName, 
            lastName, 
            email, 
            phone, 
            password, 
            role: role || 'user',
            points: 0
        });

        await user.save();

        // Ne pas renvoyer le mot de passe
        const userData = user.toObject();
        delete (userData as any).password;

        res.status(201).json(
            new ApiResponse(201, 'Utilisateur créé avec succès', userData)
        );
    } catch (error) {
        console.error('Erreur dans createUser:', error);
        res.status(500).json(
            new ApiResponse(500, 'Erreur lors de la création de l\'utilisateur')
        );
    }
};

/**
 * Met à jour un utilisateur
 */
export const updateUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Ne permet pas de modifier le mot de passe via cette route
        if (updateData.password) {
            delete updateData.password;
        }

        const user = await User.findByIdAndUpdate(
            id, 
            updateData, 
            { new: true, select: '-password' }
        );

        if (!user) {
            return res.status(404).json(
                new ApiResponse(404, 'Utilisateur non trouvé')
            );
        }

        res.status(200).json(
            new ApiResponse(200, 'Utilisateur mis à jour avec succès', user)
        );
    } catch (error) {
        console.error('Erreur dans updateUser:', error);
        res.status(500).json(
            new ApiResponse(500, 'Erreur lors de la mise à jour de l\'utilisateur')
        );
    }
};

/**
 * Supprime un utilisateur
 */
export const deleteUser = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // Empêche un admin de se supprimer lui-même
        if (req.user?._id.toString() === id) {
            return res.status(400).json(
                new ApiResponse(400, 'Vous ne pouvez pas supprimer votre propre compte')
            );
        }

        const user = await User.findByIdAndDelete(id);

        if (!user) {
            return res.status(404).json(
                new ApiResponse(404, 'Utilisateur non trouvé')
            );
        }

        res.status(200).json(
            new ApiResponse(200, 'Utilisateur supprimé avec succès')
        );
    } catch (error) {
        console.error('Erreur dans deleteUser:', error);
        res.status(500).json(
            new ApiResponse(500, 'Erreur lors de la suppression de l\'utilisateur')
        );
    }
};